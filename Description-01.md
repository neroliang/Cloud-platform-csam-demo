Continuously identifying, tracking, and managing multi-cloud assets within an organization to protect them from security threats. 

maintaining an up-to-date inventory of cloud resources, monitoring their configuration/provisioning
Ensuring they comply with security policies and controls, highlight misconfiguration and gap with industrial standard
mitigate risk against breaches and incidents

> Cloud native resource types supported (Azure, AWS, OCI) 
Querying data using Cloud native SDK

> Industry compliance standards support
== Azure:
CIS 1.5 2.0, 3, 4, 5
NIST CSF v2.0
NIST SP 800-53 R5 / Close mapping of NZISM
PCI/DSS

== AWS:
CIS 1.5 2.0, 3, 4, 5
NIST CSF v2.0
NIST 800-53 R5 (full support) / Close mapping of NZISM

== OCI:
CIS 1.5/2.0/3.0 (full support)



All the compliance rules can be defined and customized using Generic SQL and Hashicorp HCL (as Terraform)

Visual Presentation

Either by dashboard or command terminal (Web portal dashboard get defined by SQL/HCL)
Visual: A simple red/green light for each policy rule


In Azure, "Legacy" or "Auto-Assigned" Policies labeled as being "assigned by Security Center."
Microsoft Defender for Cloud (ASC) Policies: It’s what you see when you go into the "Defender for Cloud" (formerly Azure Security Center) dashboard.
General standard based Polciy (NZISM Policies, NIST, and other Azure native polices) You might encounter with duplicate reports or alerts because of the same issue. Decision-makers lack a "Single Source of Truth" or single standard, looking at too much data but not enough baseline, it is easy to misjudge the overall cloud security posture.

Managing every cloud’s policy individually is a massive drain on time. if we have a single source of truth and holistic view, we can stop being reactive and actually focus on moving the needle on our SLAs of key services.

Plus, if we only look at one-off snapshots of compliance, we lose the 'big picture' of how much work the team is putting into continuous optimization."

