
**Names, mapped to your short names**

| Yours | Name used |
|---|---|
| ra / rb / rc | `rg-storefront-prod` / `rg-dataservices-prod` / `rg-integration-prod` |
| ve1 / vf1 / vg1 / vh1 | `vnet-app-tier-prod` / `vnet-shared-services-prod` / `vnet-data-tier-prod` / `vnet-management-prod` |
| AKV (ra, PE in ve1) | `kv-storefront-secrets-prod` |
| AKV (rb, PE in vf1) | `kv-dataservices-keys-prod` |
| psql (ra, ve1) | `psql-storefront-orders-prod` |
| sqldb (rb, vg1) | `sqldb-analytics-warehouse-prod` |
| Service Bus (rc, vf1) | `sb-order-events-prod` |

**Update the skill to use it**
- In `neighbors.py`: `ALLOWED_LABELS = ["ResourceGroup","VNet","VirtualMachine","KeyVault","PostgreSQL","SqlDatabase","ServiceBus","PrivateEndpoint"]` and `ALLOWED_RELS = ["IN_RESOURCE_GROUP","IN_VNET","PRIVATE_LINK_TO"]`.
- In `SKILL.md`: replace the schema section. Direction now means "downstream" = the resource points to a container (what a VM is in), and "upstream" = what's inside or attached to a node. For example, "what's in vnet-data-tier-prod?" is upstream of that vnet over `IN_VNET`.

**Test questions, including two that should fail**

| Question | Expected |
|---|---|
| Which vnet is `vm-bastion-01` in? | downstream, IN_VNET returns `vnet-management-prod` |
| List resources in `rg-integration-prod` | upstream, IN_RESOURCE_GROUP returns 6 VMs and `sb-order-events-prod` |
| What's in `vnet-shared-services-prod`? | upstream, IN_VNET, depth 1 returns 6 VMs, `sb-order-events-prod` and `pe-kv-dataservices-keys-prod` |
| Which VMs are in `vnet-data-tier-prod` and `rg-dataservices-prod`? | two-step, **should fail** because the script can't intersect |
| Which Key Vaults are reachable from `vnet-app-tier-prod`? | needs mixed directions (upstream IN_VNET, then downstream PRIVATE_LINK_TO), so **should fail or return only the PE**. This shows when to add a dedicated script. |

Those last two show where a single-purpose script stops working. A natural next step is a second script, like `vnet_contents.py` with a `--rg` filter, and checking whether Copilot picks it correctly.