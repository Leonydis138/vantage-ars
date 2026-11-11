export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

import type { DelegationPolicy } from "./delegation";

export type { DelegationPolicy };

export const ACTION_KINDS = [
  "route_inbound",
  "draft_reply",
  "create_lead",
  "update_lead",
  "draft_campaign",
  "activate_campaign",
  "handoff_to_sales",
  "open_opportunity",
  "advance_opportunity",
  "issue_quote",
  "propose_close_won",
  "propose_close_lost",
  "issue_invoice",
  "record_expense",
  "record_inbound_payment",
  "open_ticket",
  "update_ticket",
  "draft_document",
  "notify_operator",
  "escalate_account_risk",
  "fulfil_service",
  "start_subscription",
  "cancel_subscription",
  "send_customer_mail",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export type AgentStatus = "idle" | "working" | "blocked" | "halted";
export type AutonomyLevel = "A0" | "A1" | "A2" | "A3";
export type ApprovalKind =
  "cost" | "sales_handoff" | "customer_win" | "customer_loss" | "constraint_margin";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "skipped";
export type DecisionStatus = "authorized" | "executed" | "blocked" | "escalated";
export type Reversibility =
  "fully_reversible" | "costly_reversible" | "partially_reversible" | "irreversible";

export type GovernorVerdict = "allow" | "review" | "deny";

export type ProvisionEnforcement =
  | "hard_block"
  | "soft_constraint"
  | "runtime"
  | "post_action"
  | "planning_heuristic"
  | "optimization_objective";

export type ProvisionCheck = {
  provision: string;
  check: string;
  passed: boolean;
  margin: number | null;
  detail: string;
};

export type ProposedAction = {
  kind: ActionKind;
  title: string;
  rationale: string;
  confidence: number;
  amountCents: number;
  companyName?: string;
  relatedId?: string;
  payload: { [key: string]: Json };
};

export type AuthorizationDecision = {
  verdict: GovernorVerdict;
  reason: string;
  approvalKind: ApprovalKind | null;
  reversibility: Reversibility;
  trace: ProvisionCheck[];
  runtimeConstraints: string[];
  /** Set when a founder delegation, rather than a founder click, authorised it. */
  delegation: { id: string; label: string; check: string } | null;
};

export type AgentDef = {
  id: string;
  callsign: string;
  title: string;
  department: string;
  spiffeId: string;
  autonomyLevel: AutonomyLevel;
  summary: string;
  allowedActions: ActionKind[];
  bindings: string[];
  authority: {
    maySpend: boolean;
    mayContactMarket: boolean;
    mayEnterSales: boolean;
    mayIssueInvoice: boolean;
    mayHaltFleet: boolean;
    vetoPower: boolean;
    maxAutonomousCents: number;
  };
};

export type CompanySnapshot = {
  id: string;
  legalName: string;
  tradingName: string;
  domain: string;
  jurisdiction: string;
  timezone: string;
  currency: string;
  vatRate: number;
  authorName: string;
  authorRole: string;
  constitutionVersion: string;
  treasuryCents: number;
  receivableCents: number;
  payableCents: number;
  autonomyLevel: AutonomyLevel;
  halted: boolean;
  haltReason: string | null;
  paymentInstructions: string;
  lastAuditHash: string;
  openedAt: string;
  updatedAt: string;
};

export type AgentRow = AgentDef & {
  status: AgentStatus;
  currentTask: string | null;
  lastHeartbeat: string | null;
  decisionsCount: number;
  escalationsCount: number;
};

export type InboundRow = {
  id: string;
  channel: string;
  companyName: string;
  subject: string;
  summary: string;
  intent: string;
  routedTo: string | null;
  status: string;
  createdAt: string;
};

export type LeadRow = {
  id: string;
  companyName: string;
  source: string;
  stage: string;
  score: number;
  summary: string;
  inboundId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OpportunityRow = {
  id: string;
  leadId: string;
  companyName: string;
  stage: string;
  valueCents: number;
  summary: string;
  handoffApprovalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignRow = {
  id: string;
  name: string;
  channel: string;
  status: string;
  budgetCents: number;
  spendCents: number;
  summary: string;
  createdAt: string;
};

export type LedgerRow = {
  id: string;
  kind: string;
  counterparty: string;
  amountCents: number;
  vatCents: number;
  status: string;
  memo: string;
  relatedId: string | null;
  createdAt: string;
};

export type TicketRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  ownerAgent: string;
  summary: string;
  relatedId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentRow = {
  id: string;
  title: string;
  kind: string;
  status: string;
  summary: string;
  relatedId: string | null;
  createdAt: string;
};

export type ApprovalRow = {
  id: string;
  kind: ApprovalKind;
  title: string;
  rationale: string;
  amountCents: number;
  agentId: string;
  companyName: string | null;
  status: ApprovalStatus;
  riskScore: number;
  constitutionalTrace: ProvisionCheck[];
  action: ProposedAction;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type DecisionRow = {
  id: string;
  agentId: string;
  actionKind: string;
  title: string;
  rationale: string;
  status: DecisionStatus;
  confidence: number;
  reversibility: Reversibility;
  amountCents: number;
  constitutionalTrace: ProvisionCheck[];
  observation: { [key: string]: Json };
  action: { [key: string]: Json };
  evidenceHash: string;
  previousHash: string;
  recordHash: string;
  createdAt: string;
};

export type ServiceTimeRow = {
  id: string;
  companyName: string;
  minutes: number;
  note: string;
  workedAt: string;
  createdAt: string;
};

export type GateRecordRow = {
  id: string;
  approvalId: string;
  decisionId: string | null;
  questions: { question: string; passed: boolean; detail: string }[];
  legal: boolean;
  failedQuestion: string | null;
  reasoning: string | null;
  evidenceShown: string | null;
  policyVersion: string;
  exposureAt: string;
  decidedAt: string | null;
  createdAt: string;
};

export type DecisionReceiptRow = {
  id: string;
  decisionId: string;
  actionKind: string;
  amountCents: number;
  riskTier: string;
  delegationId: string | null;
  approvedBy: string | null;
  approvalId: string | null;
  chainHead: string;
  signatureValid: boolean;
  signedAt: string;
};

export type GovernanceEpisodeRow = {
  id: string;
  actionKind: string;
  companyName: string | null;
  amountCents: number;
  amountBand: string | null;
  stage: string | null;
  policyVersion: string | null;
  outcome: "approved" | "rejected";
  reasonCode: string;
  reasoning: string;
  exceptionConditions: string | null;
  laterOutcome: string | null;
  decidedAt: string;
  decisionId: string | null;
  agentId: string | null;
};

export type GovernanceRecord = {
  episodes: GovernanceEpisodeRow[];
  gates: GateRecordRow[];
  receipts: DecisionReceiptRow[];
  receiptKey: "environment" | "placeholder";
};

export type MonthlyGovernanceReport = {
  month: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  records: {
    decisionEpisodes: number;
    gatesCreated: number;
    receiptsSigned: number;
    receiptsWithInvalidSignatures: number;
  };
  delegation: {
    policy: {
      label: string;
      status: string;
      maxAmountCents: number;
      maxActionsPerDay: number;
      maxActionsPerMonth: number;
    } | null;
    usage: {
      actions: number;
      spendCents: number;
      largestActionCents: number;
      maxActionsInRecordedDay: number;
      daily: { usageDay: string; actions: number; spendCents: number }[];
    };
    exceedsCurrentCeiling: {
      perAction: boolean;
      dailyActions: boolean;
      monthlyActions: boolean;
    } | null;
  };
  chain: {
    ok: boolean;
    checked: number;
    brokenAt: string | null;
    detail: string;
    storedHead: string;
  };
};

export type AuditRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  actor: string;
  previousHash: string;
  recordHash: string;
  createdAt: string;
};

export type ProvisionRow = {
  id: string;
  articleId: string;
  title: string;
  priority: number;
  body: string;
  enforcement: ProvisionEnforcement;
  machineCheckable: boolean;
  parameters: { [key: string]: Json };
};

export type AutonomyHealth = {
  overall: number;
  decisionQuality: number;
  constraintAdherence: number;
  selfHealing: number;
  governance: number;
  interventionRate: number;
  autonomousResolution: number;
  decisionCount: number;
  pendingApprovals: number;
  hardViolations: number;
  /** Approvals the founder has already decided, so the gate backlog has a history. */
  resolvedApprovals: number;
};

export type MailStatus = {
  smtpConnected: boolean;
  account: string | null;
};

export type OfficeSnapshot = {
  company: CompanySnapshot;
  provisions: ProvisionRow[];
  agents: AgentRow[];
  inbound: InboundRow[];
  leads: LeadRow[];
  opportunities: OpportunityRow[];
  campaigns: CampaignRow[];
  ledger: LedgerRow[];
  tickets: TicketRow[];
  documents: DocumentRow[];
  approvals: ApprovalRow[];
  decisions: DecisionRow[];
  audit: AuditRow[];
  notices: NoticeRow[];
  mail: MailStatus;
  health: AutonomyHealth;
  /** The founder's standing delegation, if there is one. */
  delegation: DelegationPolicy | null;
  /** How much of it has been used. */
  delegationUsage: DelegationUsage;
  /** The recurring-revenue book. */
  subscriptions: SubscriptionRow[];
  /** The money picture, including recurring revenue. */
  revenue: RevenueMetrics;
};

export type NoticeRow = {
  id: string;
  kind: string;
  subject: string;
  status: "sent" | "not_delivered";
  detail: string;
  createdAt: string;
};

export type DispatchResult = {
  ok: boolean;
  briefing: string;
  error?: string;
  executed: number;
  escalated: number;
  blocked: number;
  decisionIds: string[];
  approvalIds: string[];
};

export type SubscriptionStatus = "active" | "paused" | "cancelled" | "completed";

export type SubscriptionRow = {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  planId: string;
  rateId: string;
  cycle: string;
  priceCents: number;
  status: SubscriptionStatus;
  opportunityId: string | null;
  quoteDocumentId: string | null;
  startedAt: string;
  nextBillingAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingCycleStatus =
  "pending" | "invoiced" | "fulfilled" | "notified" | "paid" | "cancelled";

export type BillingCycleRow = {
  id: string;
  subscriptionId: string;
  companyName: string;
  planId: string;
  rateId: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  status: BillingCycleStatus;
  invoiceId: string | null;
  documentId: string | null;
  reportDocumentId: string | null;
  noticeDocumentId: string | null;
  createdAt: string;
  fulfilledAt: string | null;
  notifiedAt: string | null;
  paidAt: string | null;
};

export type DelegationUsage = {
  usedToday: number;
  usedThisMonth: number;
  spentTodayCents: number;
  spentThisMonthCents: number;
};

/** The recurring-revenue picture the office reports to itself. */
export type ReceivablesAging = {
  currentCents: number;
  days8To30Cents: number;
  days31To60Cents: number;
  over60Cents: number;
};

export type UpcomingRenewal = {
  subscriptionId: string;
  companyName: string;
  planId: string;
  priceCents: number;
  nextBillingAt: string;
};

export type RevenueMetrics = {
  activeSubscriptions: number;
  pausedSubscriptions: number;
  cancelledSubscriptions: number;
  monthlyRecurringCents: number;
  annualRecurringCents: number;
  oneOffPipelineCents: number;
  billedThisMonthCents: number;
  collectedThisMonthCents: number;
  outstandingCents: number;
  overdueCents: number;
  churnRiskCount: number;
  aging: ReceivablesAging;
  upcomingRenewals: UpcomingRenewal[];
  planMix: { planId: string; title: string; subscriptions: number; monthlyCents: number }[];
};
