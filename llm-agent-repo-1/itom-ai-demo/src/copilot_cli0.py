import asyncio
import os
import sys
from copilot import CopilotClient
from copilot.session import PermissionHandler
from copilot.session_events import AssistantMessageData  # Crucial for extracting the text

async def main():
    client = CopilotClient()
    await client.start()

    # Create the core session
    model = os.environ.get("COPILOT_MODEL", "auto")
    session = await client.create_session(
        on_permission_request=PermissionHandler.approve_all, 
        model=model
    )

    print("Cloud Copilot Chat Ready! Type a question (Ctrl+C to exit).\n")

    try:
        while True:
            # 1. Grab user input from the console terminal
            q = input("question> ").strip()
            if not q:
                continue
            
            # 2. Pass the raw string directly into send_and_wait
            reply = await session.send_and_wait(q)
            
            # 3. Match the data structure to cleanly extract the assistant's answer text
            if reply and reply.data:
                match reply.data:
                    case AssistantMessageData() as data:
                        print(f"Copilot> {data.content}\n")
                    case _:
                        # Fallback case if it evaluates to an unexpected event type
                        print(f"Copilot> [Event type received: {reply.type}]\n")
            else:
                print("Copilot> [No response generated]\n")

    except (KeyboardInterrupt, EOFError):
        print("\nExiting chat loop safely.")
    
    finally:
        # Properly deallocate and close connections
        await session.destroy()
        await client.stop()

if __name__ == "__main__":
    asyncio.run(main())
