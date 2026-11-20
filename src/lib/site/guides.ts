/**
 * Plain-language technical guides.
 *
 * These are public explanations, not promises and not a substitute for a
 * written scope. They describe checks a competent person can make and say
 * plainly where the work stops. Nothing here reads an office record or names
 * a customer.
 */
import type { ServicePage } from "@/lib/site/services";

export type GuideSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type Guide = {
  slug: string;
  title: string;
  metaTitle: string;
  description: string;
  summary: string;
  updated: string;
  readingMinutes: number;
  sections: GuideSection[];
  faq?: { q: string; a: string };
  relatedServices: ServicePage["slug"][];
};

export const GUIDES: Guide[] = [
  {
    slug: "one-way-audio",
    title: "One-way audio on a VoIP call: what to check first",
    metaTitle: "One-way VoIP audio checklist · Vantage-ARS",
    description:
      "A practical order for narrowing one-way audio: endpoint, local network, NAT and firewall, then the carrier. What to record before changing anything.",
    summary:
      "The call connects but only one side can hear. Work from the handset outward before blaming the carrier.",
    updated: "2026-10-22",
    readingMinutes: 5,
    sections: [
      {
        heading: "What one-way audio usually means",
        paragraphs: [
          "Signalling and media are different paths. The call can connect cleanly while the audio stream in one direction never arrives. That is why a dial tone, a ringing phone or a connected call is not evidence that media is flowing both ways.",
          "The fault can sit in the handset, the local network, a firewall or NAT device, the internet path, or the carrier. The order below starts with the evidence you can gather yourself and moves outward.",
        ],
      },
      {
        heading: "Check in this order",
        paragraphs: [
          "Change one thing at a time and write down what changed. A fault that moves or disappears after a change is evidence; a fault that stays is evidence too.",
        ],
        bullets: [
          "Endpoint: try a second handset or softphone on the same account. If both fail the same way, the endpoint is less likely to be the cause.",
          "Local network: confirm the device has a valid address, the correct gateway and a working route. Check whether the call works on a different VLAN or network.",
          "NAT and firewall: stateful inspection, SIP application-layer gateways and asymmetric routing can drop one media direction. Record the make, model and firmware before touching a rule.",
          "Path: test from another site or connection. A VPN, ISP change or new router is a common moment for one-way audio to appear.",
          "Carrier: if media fails only for one number range or one provider, the carrier or interconnect is the next place to look. Access there is usually outside our scope and must be agreed in writing.",
        ],
      },
      {
        heading: "What to record before you change anything",
        paragraphs: [
          "A useful record is specific enough for somebody else to reproduce the fault. Note the time with a timezone, the calling and called numbers, the handset or softphone and its firmware, the network path, the codecs in use, and every change made during the test.",
          "If somebody can capture traffic lawfully, a capture on both sides is stronger than a description. Do not send credentials, private keys or personal data in a chat or email.",
        ],
      },
      {
        heading: "When to stop and ask for a written scope",
        paragraphs: [
          "Stop when the next step needs carrier access, a vendor account, a production firewall change, or a site visit. Those are separate pieces of work with their own access, risk and price. A remote diagnosis can narrow the fault without promising that the carrier will restore anything.",
        ],
      },
    ],
    faq: {
      q: "Can a firewall cause one-way audio?",
      a: "Yes. NAT, stateful inspection, SIP application-layer gateways and asymmetric routing can all drop media in one direction. Record the configuration before changing it, and make one change at a time so the result means something.",
    },
    relatedServices: ["voip", "networking"],
  },
  {
    slug: "backup-is-not-recovery",
    title: "A backup is not a recovery plan",
    metaTitle: "Backup vs recovery: what to test · Vantage-ARS",
    description:
      "A successful backup job proves a job ran, not that data can be restored. What a useful restore test records, the common gaps, and where to start.",
    summary:
      "A green backup job is not evidence that a recovery works. The only useful evidence is a restore that was actually performed and recorded.",
    updated: "2026-10-22",
    readingMinutes: 6,
    sections: [
      {
        heading: "What a backup job actually proves",
        paragraphs: [
          "A successful job usually proves that software read something and wrote it somewhere. It does not prove that the copy is complete, that the encryption key is available, that the restore tool still works, or that the business can operate from the recovered data.",
          "Those are different claims. A backup review should separate what exists, what has been tested, and what is only assumed.",
        ],
      },
      {
        heading: "What a useful restore test records",
        paragraphs: [
          "A restore test is a small project with an owner, a target and acceptance checks. The record matters as much as the result.",
        ],
        bullets: [
          "What was restored: the system, the data set, the point in time and the backup copy used.",
          "Where it was restored: an isolated environment, never over the live system.",
          "Who did it and how long it took, measured rather than estimated.",
          "What was checked: file counts, application startup, a known record, a checksum or a business-level check.",
          "What was missing: the gap between the recovered state and the state at failure, including the backup interval.",
          "What would still be required: credentials, licences, network access, DNS changes or a decision about which system comes back first.",
        ],
      },
      {
        heading: "The common gaps",
        paragraphs: [
          "The same failure domain is the most common one: the backup lives on the same host, array, building or account as the original. The second is an untested restore. The third is a key or credential stored only with the person who left. The fourth is retention that does not match the business or legal requirement.",
          "None of those are fixed by buying more storage. They are fixed by writing down the recovery path and testing the parts that can be tested.",
        ],
      },
      {
        heading: "Where to start",
        paragraphs: [
          "Pick one important system, not the whole estate. Restore it to an isolated place, record what happened, and list what would have blocked a real recovery. That single exercise is more useful than another dashboard that says the job succeeded.",
          "We review the backup and restore path you say is in place and report what exists, what is untested and what is missing. We do not promise that data can be recovered, and we do not perform a recovery as part of that review.",
        ],
      },
    ],
    faq: {
      q: "How often should a restore be tested?",
      a: "There is no single interval that fits every system. Test after a material change to the system, the backup software, the storage or the people who own the process, and often enough that the recovery steps are still familiar. The result of the test matters more than the calendar.",
    },
    relatedServices: ["backup-recovery", "security"],
  },
  {
    slug: "wifi-drops",
    title: "Wi-Fi drops and dead spots: signal, capacity or roaming?",
    metaTitle: "Diagnosing Wi-Fi drops and dead spots · Vantage-ARS",
    description:
      "Separate a weak signal from a capacity problem and a roaming problem. A practical order for diagnosing Wi-Fi that drops, stalls or fails in one part of a building.",
    summary:
      "Not every Wi-Fi fault is a weak signal. Capacity, interference, roaming and the wired path produce different symptoms and need different fixes.",
    updated: "2026-10-22",
    readingMinutes: 6,
    sections: [
      {
        heading: "Three different faults",
        paragraphs: [
          "A weak signal is not the same as too many clients, and neither is the same as a device that holds on to the wrong access point. If the diagnosis starts with the conclusion, the fix is usually a new access point that does not solve the real problem.",
        ],
        bullets: [
          "Coverage: the signal is too weak or too noisy where the device is used.",
          "Capacity: the signal is fine but the airtime, channel or upstream link is saturated.",
          "Roaming: the device stays associated with a distant access point instead of moving to a closer one.",
          "Wired path: the access point is fine but its switch port, cable or upstream connection is not.",
        ],
      },
      {
        heading: "Separate the fault before changing hardware",
        paragraphs: [
          "Test a wired device on the same network at the same time. If the wired path also fails, the problem is not the Wi-Fi. If only one device fails, compare it with a second device in the same place. If every device fails in one area, record which access point serves that area and what the device sees.",
          "Write down the time, the location, the device, the access point, the signal reading and what the user was doing. A fault that happens at the same time every day is a different problem from one that follows a person around the building.",
        ],
      },
      {
        heading: "What to check",
        paragraphs: [
          "Check channel width and overlap before adding power. A louder access point can make interference worse. Check the wired uplink and PoE budget. Check whether the device supports the security and band settings being offered. Check whether a guest, staff or voice network is competing for the same airtime.",
          "For roaming, check whether the access points are on the same network and whether the device supports the roaming standard in use. Not every client roams well, and a controller cannot force a client that refuses to move.",
        ],
      },
      {
        heading: "When a site survey is worth it",
        paragraphs: [
          "A survey is worth it when the building layout, materials or access points are part of the problem, or when a change is about to be designed. A survey produces measurements and a written recommendation; it does not guarantee coverage in every corner or every device.",
          "If the next step needs cabling, drilling, ceiling access or new hardware, that is separate work with its own quote. Keep the diagnosis and the installation as separate decisions.",
        ],
      },
    ],
    faq: {
      q: "Will a new access point fix a dead spot?",
      a: "Only if coverage is the actual fault. If the problem is capacity, interference, roaming or the wired uplink, another access point can make it worse. Measure first, then decide.",
    },
    relatedServices: ["networking", "it-infrastructure"],
  },
  {
    slug: "change-without-rollback",
    title: "Before you change the firewall, write the way back",
    metaTitle: "Firewall and infrastructure change checklist · Vantage-ARS",
    description:
      "A change without a rollback is a bet. What to write down before a firewall, router or server change, and how to tell whether it worked.",
    summary:
      "The most useful part of a change plan is the way back. Write the rollback, the acceptance checks and the stop conditions before touching the device.",
    updated: "2026-10-22",
    readingMinutes: 5,
    sections: [
      {
        heading: "A change plan is mostly the way back",
        paragraphs: [
          "A firewall or router change can remove access to the device that manages it. If the only plan is to fix it forward, the business is taking a bet it did not need to take. The way back should be written before the first command is entered.",
        ],
      },
      {
        heading: "What the change note should contain",
        paragraphs: [
          "The note can be short, but it must be specific enough for a different person to follow under pressure.",
        ],
        bullets: [
          "Scope: the exact device, interface, rule, route or service being changed, and what is explicitly out of scope.",
          "Owner: who makes the change, who can approve a stop, and who is available if it goes wrong.",
          "Window: when it starts, how long it may run, and what happens if it is not finished in time.",
          "Access: a second path to the device that does not depend on the change being made.",
          "Evidence: a configuration export or screenshot, the current version, and a backup that has been checked.",
          "Rollback: the exact steps back, the expected state, and how long the rollback takes.",
          "Acceptance: the checks that prove the change worked, not just that the device accepted the command.",
          "Stop conditions: the symptoms that mean roll back now rather than keep trying.",
        ],
      },
      {
        heading: "During the change",
        paragraphs: [
          "Make one change at a time and record the time. Keep the old configuration until the new one has passed its checks. If a check depends on a person at another site, agree the contact before the window starts.",
          "A change that cannot be verified is not finished. A change that was rolled back is not a failure if the record is clear about what was tried and what state the system is in now.",
        ],
      },
      {
        heading: "After the change",
        paragraphs: [
          "Write a short completion note: what was changed, what was tested, what passed, what did not, and what risk remains. Hand over the new configuration and the rollback record to whoever operates the system next. A future change should not have to reconstruct this one from memory.",
        ],
      },
    ],
    faq: {
      q: "Do we always need a maintenance window?",
      a: "If the change can interrupt a service people are using, agree a window and a way back before it starts. A window is not a service level; it is a boundary that lets the work be stopped safely.",
    },
    relatedServices: ["it-infrastructure", "networking", "security"],
  },
  {
    slug: "prepare-for-remote-support",
    title: "What to have ready before a remote support session",
    metaTitle: "Prepare for a remote support session · Vantage-ARS",
    description:
      "A short checklist that makes remote diagnosis faster: the right access, the real symptoms, recent changes and a named person who can approve a change.",
    summary:
      "Remote work goes faster when the scope, access and authority are ready before the session starts.",
    updated: "2026-10-22",
    readingMinutes: 4,
    sections: [
      {
        heading: "The five things that save the most time",
        paragraphs: [
          "None of these require sharing a password in a message. They are the facts a person needs to work safely and to know when to stop.",
        ],
        bullets: [
          "The symptom, in plain language: what stopped, what it does now, and when it started.",
          "The system and location: the site, the device or service, and the person who can see it.",
          "The recent changes: a new router, an ISP change, a software update, a moved cable, a new starter.",
          "Lawful access: an agreed remote session or an account that can be enabled for the work, with the customer present or reachable.",
          "Authority: who can approve a change during the session, and what must wait for a written quote.",
        ],
      },
      {
        heading: "What not to send",
        paragraphs: [
          "Do not send passwords, private keys, card numbers or personal information in an enquiry, chat or email. A remote session can be arranged without putting a credential in a message. If a password must be reset, agree how it will be shared before the session.",
        ],
      },
      {
        heading: "Set the boundary before the work starts",
        paragraphs: [
          "Remote support is charged by time with a minimum, and the written quote states the scope, the hours, the VAT treatment and what is excluded. A session can diagnose and fix an in-scope fault; it cannot silently widen into new work or a carrier commitment. If the fault turns out to need either, that is a separate decision.",
        ],
      },
    ],
    faq: {
      q: "Can you work while we are not available?",
      a: "Only if that access and authority were agreed in writing beforehand. Otherwise the session needs somebody who can see the system and approve a change. We do not ask for standing access through a support form.",
    },
    relatedServices: ["managed-support", "it-infrastructure"],
  },
  {
    slug: "sip-alg-breaks-voip",
    title: "SIP ALG breaks VoIP calls behind a router: what to check",
    metaTitle: "SIP ALG and VoIP call failures · Vantage-ARS",
    description:
      "Why a router's SIP application-layer gateway can break registration, audio and transfers, and a practical order for confirming it before you change a rule.",
    summary:
      "A router feature meant to help VoIP often breaks it. Confirm the cause before you disable anything, and record what changed.",
    updated: "2026-11-20",
    readingMinutes: 5,
    sections: [
      {
        heading: "What the feature does, and why it causes trouble",
        paragraphs: [
          "A SIP application-layer gateway, usually called SIP ALG, sits inside a router and tries to rewrite the addresses in VoIP signalling so calls work through address translation. SIP carries addresses inside the message body as well as in the packet header, and a router that rewrites them only partly, or in the wrong place, breaks the call rather than fixing it.",
          "The result is a fault that looks like the provider, the handset or the network. Calls register and then drop, audio flows one way, transfers and hold fail, or a second handset on the same account cannot register at all. The same account can work perfectly on a mobile hotspot and fail only behind one router.",
        ],
      },
      {
        heading: "Confirm it before you change anything",
        paragraphs: [
          "Do not start by disabling settings on a router that carries the business. Gather evidence first, because a fault that disappears after a change is only useful if the same checks were run before it.",
        ],
        bullets: [
          "Test the same account on a different network, such as a mobile hotspot. If it works there, the fault is more likely local to the site than at the provider.",
          "Test a second handset or softphone behind the same router. If both fail the same way, the endpoint is less likely to be the cause.",
          "Write down the exact symptom and the moment it happens: registration, the first thirty seconds of a call, a transfer, hold, or a second concurrent call.",
          "Record the router's make, model and firmware, and export its configuration before touching a rule.",
          "Look for the setting by its common names: SIP ALG, SIP helper, SIP transformation or NAT helper. Note whether it is on.",
        ],
      },
      {
        heading: "Change one thing, then repeat the same checks",
        paragraphs: [
          "If the evidence points at the router, turn off the SIP ALG alone — not the firewall, not address translation and not the whole security policy. Re-register the handset, then run exactly the checks that failed before. Record the result either way.",
          "If the fault improves, keep the setting off and write down what changed so the next person does not switch it back on. If nothing improves, restore the previous setting and continue from the next layer: the local network, the internet path, or the provider's configuration.",
          "Some routers supplied by an internet provider do not expose the setting, or reset it after an update. That is a conversation with the provider, not something to work around with an unsupported firmware change.",
        ],
      },
      {
        heading: "Where this work stops",
        paragraphs: [
          "This guide is general information, not a diagnosis of your network. Changing a router that carries calls, card payments or remote access can interrupt the business, so it belongs in a written scope with a way back.",
          "If the router or the provider's equipment is outside what we are authorised to change, the fix is agreed with whoever owns it. A provider-side change is not something a support session can promise.",
        ],
      },
    ],
    faq: {
      q: "Will disabling SIP ALG fix my calls?",
      a: "Only if the ALG is the actual fault. If the same checks fail after it is off, restore the setting and keep looking at the network path or the provider. Measure first, then change one thing.",
    },
    relatedServices: ["voip", "networking"],
  },
];

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
