# CI type mapping

Maps an input CI class into an output node `type`, an optional Font-Awesome
`icon`, and a default accent colour. Apply in this order:

1. A container `labels` entry (`ResourceGroup`, `VNet`, `Subnet`,
   `AvailabilityZone`) → `group` (wins over any CI class).
2. An exact `ci_class` / `sys_class_name` match below.
3. A prefix/substring match (e.g. `*_server` → `server`).
4. Fallback → `generic` (renders with the server style).

## ServiceNow CMDB classes

| CI class | node `type` | icon | accent |
| --- | --- | --- | --- |
| `cmdb_ci_linux_server`, `cmdb_ci_win_server`, `cmdb_ci_server` | `server` | `fa-server` | `#38bdf8` |
| `cmdb_ci_db_instance`, `cmdb_ci_database`, `cmdb_ci_db_*` | `database` | `fa-database` | `#a78bfa` |
| `cmdb_ci_lb`, `cmdb_ci_load_balancer`, `cmdb_ci_lb_*` | `load_balancer` | `fa-network-wired` | `#22d3ee` |
| `cmdb_ci_appl`, `cmdb_ci_app_server`, `cmdb_ci_web_server` | `server` | `fa-cube` | `#e879f9` |
| `cmdb_ci_cloud_service`, `cmdb_ci_cloud_object_storage` | `cloud_service` | `fa-cloud` | `#34d399` |
| `cmdb_ci_netgear`, `cmdb_ci_switch`, `cmdb_ci_router`, `cmdb_ci_firewall` | `generic` | `fa-ethernet` | `#fbbf24` |
| `cmdb_ci_vm_instance`, `cmdb_ci_virtual_machine` | `server` | `fa-server` | `#38bdf8` |
| `cmdb_ci_k8s_*`, `cmdb_ci_container` | `generic` | `fa-cubes` | `#60a5fa` |
| `cmdb_ci_cloud_*_group` | `group` | `fa-layer-group` | `#3b82f6` |
| `cmdb_ci_function`, `cmdb_ci_serverless` | `cloud_service` | `fa-bolt` | `#facc15` |

## Azure resource types (`properties.resource_type`)

| Resource type | node `type` | icon |
| --- | --- | --- |
| `Microsoft.Compute/virtualMachines` | `server` | `fa-server` |
| `Microsoft.Web/sites`, `Microsoft.Web/serverFarms` | `server` | `fa-cube` |
| `Microsoft.Sql/servers/databases`, `Microsoft.DBforPostgreSQL/*` | `database` | `fa-database` |
| `Microsoft.Network/loadBalancers`, `Microsoft.Network/applicationGateways` | `load_balancer` | `fa-network-wired` |
| `Microsoft.Network/privateEndpoints` | `secure` → `cloud_service` | `fa-shield-halved` |
| `Microsoft.Storage/storageAccounts` | `cloud_service` | `fa-cloud` |
| `Microsoft.Network/virtualNetworks` | `group` (`kind: vnet`) | `fa-network-wired` |
| `Microsoft.Network/virtualNetworks/subnets` | `group` (`kind: subnet`) | `fa-diagram-project` |
| `Microsoft.Resources/resourceGroups` | `group` (`kind: resource_group`) | `fa-layer-group` |
| `Microsoft.Network/networkInterfaces` | `generic` | `fa-ethernet` |
| `Microsoft.KeyVault/vaults` | `cloud_service` | `fa-key` |

## AWS resource types

| Resource type | node `type` | icon |
| --- | --- | --- |
| `AWS::EC2::Instance` | `server` | `fa-server` |
| `AWS::RDS::DBInstance`, `AWS::DynamoDB::Table` | `database` | `fa-database` |
| `AWS::ElasticLoadBalancingV2::LoadBalancer` | `load_balancer` | `fa-network-wired` |
| `AWS::S3::Bucket` | `cloud_service` | `fa-bucket` |
| `AWS::Lambda::Function` | `cloud_service` | `fa-bolt` |
| `AWS::EC2::VPC`, `AWS::EC2::Subnet` | `group` | `fa-layer-group` |

## OCI resource types

| Resource type | node `type` | icon |
| --- | --- | --- |
| `oci:Compute:Instance` | `server` | `fa-server` |
| `oci:Database:AutonomousDatabase` | `database` | `fa-database` |
| `oci:LoadBalancer:LoadBalancer` | `load_balancer` | `fa-network-wired` |
| `oci:ObjectStorage:Bucket` | `cloud_service` | `fa-bucket` |
| `oci:Core:Vcn`, `oci:Core:Subnet` | `group` | `fa-layer-group` |

## Output node types (fixed vocabulary)

The `nodeTypes` registry and the data `type` field must use exactly these keys:

`server`, `database`, `load_balancer`, `cloud_service`, `group`, `generic`.

If a mapping is genuinely ambiguous, prefer `generic` — never invent a new type
without also adding a matching component to `nodeTypes`.
