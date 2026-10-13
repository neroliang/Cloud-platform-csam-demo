import asyncio
import os
import sys
import time
from dataclasses import dataclass, field

from copilot import CopilotClient
from copilot.session import PermissionHandler
from copilot.session_events import (
    AssistantIntentData,
    AssistantMessageData,
    AssistantTurnStartData,
    AssistantUsageData,
    SessionErrorData,
    ToolExecutionCompleteData,
    ToolExecutionStartData,
)
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    Progress,
    SpinnerColumn,
    TaskProgressColumn,
    TextColumn,
    TimeElapsedColumn,
)
from rich.text import Text
from rich.theme import Theme

# Avoid UnicodeEncodeError for emoji/box glyphs on legacy (cp1252) Windows consoles.
for _stream in (sys.stdout, sys.stdin):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

THEME = Theme(
    {
        "prompt": "bold cyan",
        "info": "dim cyan",
        "ok": "bold green",
        "warn": "bold yellow",
        "err": "bold red",
        "tool": "magenta",
        "bar.key": "black on cyan",
        "bar.val": "white on grey23",
    }
)
console = Console(theme=THEME)

MODEL = os.environ.get("COPILOT_MODEL", "auto")
TIMEOUT = float(os.environ.get("COPILOT_TIMEOUT", "300"))
EXIT_WORDS = {"exit", "quit", ":q"}


@dataclass
class TurnStats:
    """Per-turn telemetry collected from session events."""

    activity: str = "Thinking…"
    tools: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    model: str | None = None


def new_progress() -> Progress:
    return Progress(
        SpinnerColumn(style="cyan"),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(bar_width=30, style="grey23", complete_style="cyan", pulse_style="cyan"),
        TaskProgressColumn(),
        TimeElapsedColumn(),
        console=console,
        transient=True,
    )


def status_bar(turn: int, model: str, latency: float | None, stats: TurnStats | None) -> Text:
    """One-line minimal status bar rendered beneath each answer."""
    segments: list[tuple[str, str]] = [("model", model), ("turn", str(turn))]
    if latency is not None:
        segments.append(("time", f"{latency:.1f}s"))
    if stats:
        if stats.input_tokens or stats.output_tokens:
            segments.append(("tokens", f"{stats.input_tokens}↑ {stats.output_tokens}↓"))
        if stats.tools:
            segments.append(("tools", str(len(stats.tools))))
    bar = Text()
    for key, value in segments:
        bar.append(f" {key} ", style="bar.key")
        bar.append(f" {value} ", style="bar.val")
        bar.append(" ")
    return bar


async def start_session(client: CopilotClient):
    """Start the client and create a session behind a determinate progress bar."""
    with new_progress() as progress:
        task = progress.add_task("Starting Copilot client…", total=2)
        await client.start()
        progress.update(task, advance=1, description=f"Creating session (model: {MODEL})…")
        session = await client.create_session(
            on_permission_request=PermissionHandler.approve_all,
            model=MODEL,
        )
        progress.update(task, advance=1, description="Ready")
    console.print("[ok]✔[/] Copilot client started and session created.")
    return session


async def ask(session, question: str):
    """Send a question while showing live progress driven by session events."""
    stats = TurnStats()
    progress = new_progress()
    # total=None renders an indeterminate (pulsing) bar while the agent works.
    task = progress.add_task(stats.activity, total=None)

    def on_event(event) -> None:
        match event.data:
            case AssistantTurnStartData():
                stats.activity = "Thinking…"
            case AssistantIntentData() as d if d.intent:
                stats.activity = d.intent
            case ToolExecutionStartData() as d:
                name = d.tool_title or d.tool_name
                stats.tools.append(name)
                stats.activity = f"[tool]Running tool:[/] {name}"
            case ToolExecutionCompleteData() as d:
                stats.activity = "Thinking…" if d.success else "[warn]Tool failed, recovering…[/]"
            case AssistantUsageData() as d:
                stats.input_tokens += d.input_tokens or 0
                stats.output_tokens += d.output_tokens or 0
                stats.model = d.model or stats.model
            case SessionErrorData() as d:
                stats.errors.append(d.message)
            case _:
                return
        progress.update(task, description=stats.activity)

    unsubscribe = session.on(on_event)
    start = time.perf_counter()
    try:
        with progress:
            reply = await session.send_and_wait(question, timeout=TIMEOUT)
    finally:
        unsubscribe()
    return reply, stats, time.perf_counter() - start


def render_reply(reply, stats: TurnStats) -> None:
    for message in stats.errors:
        console.print(Panel(message, title="Session error", border_style="red", title_align="left"))

    if stats.tools:
        console.print(Text.assemble(("  ⚙ tools used: ", "info"), (", ".join(stats.tools), "tool")))

    if not reply or not reply.data:
        console.print("[warn]Copilot›[/] [dim]No response generated.[/]")
        return

    match reply.data:
        case AssistantMessageData() as data:
            console.print(
                Panel(
                    Markdown(data.content or "_(empty response)_", code_theme="monokai"),
                    title="[ok]Copilot[/]",
                    title_align="left",
                    border_style="green",
                    padding=(1, 2),
                )
            )
        case _:
            console.print(f"[warn]Copilot›[/] Unexpected event type: [bold]{reply.type}[/]")


async def main():
    console.print(
        Panel.fit(
            "[bold]🚀 Home-grown Copilot Chat[/]\n"
            "[info]Type a question · 'exit' or Ctrl+C to quit[/]",
            border_style="cyan",
        )
    )

    client = CopilotClient()
    session = None
    turn = 0
    try:
        session = await start_session(client)
        console.print(status_bar(turn, MODEL, None, None))

        while True:
            console.print()
            q = console.input("[prompt]question›[/] ").strip()
            if not q:
                continue
            if q.lower() in EXIT_WORDS:
                break

            turn += 1
            try:
                reply, stats, latency = await ask(session, q)
            except TimeoutError:
                console.print(f"[err]✖ Timed out after {TIMEOUT:.0f}s[/] [dim](set COPILOT_TIMEOUT to extend)[/]")
                continue
            except Exception as exc:  # keep the chat alive on per-turn failures
                console.print(f"[err]✖ Request failed:[/] {exc}")
                continue

            render_reply(reply, stats)
            console.print(status_bar(turn, stats.model or MODEL, latency, stats))

    except (KeyboardInterrupt, EOFError, asyncio.CancelledError):
        console.print()
    except Exception as exc:
        console.print(f"[err]✖ Fatal error:[/] {exc}")
    finally:
        with console.status("[info]Closing session…[/]", spinner="dots"):
            if session is not None:
                await session.disconnect()
            await client.stop()
        console.print("[info]👋 Exited chat loop safely.[/]")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
