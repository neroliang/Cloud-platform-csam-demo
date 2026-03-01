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



Sometimes, we may see multiple, overlapping policy standards get used in some platform, which often incur duplicate alerts or non-compliance reports;  
For Business Impact: "Alert Fatigue" leads to critical security warnings being ignored.  Decision-makers lack a "Single Source of Truth" or single standard to gauge overall security posture.

Multiple Cloud platform policies doubles up efforts of monitoring compliance and maintaining policy definition up-to-date.

Relying "point-in-time" snapshots of policy compliance data, cause losing insights on how Cloud engineer/platform team is making continusous improvement/optimization

