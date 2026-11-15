---
name: Vantage ARS autonomy and approvals
description: Product constraints for real data, external actions, the existing domain, and social access.
---

Vantage ARS uses `vantage-ars.co.za` as its existing public website. Do not replace it or change its DNS without explicit approval.

The owner requires real business data only; do not create seeded, demo, or simulated customer records. The owner explicitly chose automatic sending for all customer messages. Once Gmail and Grok are healthy, the worker may send customer messages and sync configured CRM records without per-message approval; the owner can pause it at any time. The owner enters business bank details for quote sending.

Autonomy timing is owner-configurable through automation policy: SLA hours, follow-up days, archive days, a remote-session scheduling link, and signed outbound webhook notifications. Escalations, follow-ups, and archiving use those stored settings. Webhook payloads use HMAC-SHA256 when a secret is configured. Automatic-cycle history is retained for 90 days.

The owner supplied Meta app ID `2343035023174094`. An app ID alone does not authorize Facebook Page access or publishing.

**Why:** the user asked to maximize autonomy and explicitly selected automatic sending for all customer messages.

**How to apply:** automate available customer messaging and CRM work only through live connected providers; do not invent channels, customer records, or financial actions. Show unavailable channels as setup-required and record actions in the audit trail.
