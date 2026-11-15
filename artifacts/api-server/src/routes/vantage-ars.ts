import { Router, type IRouter, type Request, type Response } from "express";
import { requireVantageOwner, type OwnerRequest } from "../middlewares/requireVantageOwner";
import {
  acceptQuote,
  decideQuote,
  getAutomationSettings,
  getDashboard,
  getInquiry,
  getAutonomousMetrics,
  getQuotePreview,
  listAuditEvents,
  listAutomationRuns,
  listInquiries,
  OperationsError,
  runAutonomousCycle,
  reprocessInquiry,
  setAutomationEnabled,
  setAutomationBankDetails,
  setAutomationPolicy,
  syncInquiryToHubSpot,
  syncInquiries,
  testAutomationWebhook,
} from "../services/vantage-ars/operations";
import { ProviderError } from "../services/vantage-ars/providers";

const router: IRouter = Router();
const inquiryIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const inquiryStatuses = new Set([
  "all",
  "processing",
  "needs_review",
  "needs_information",
  "quote_ready",
  "quote_sent",
  "reply_received",
  "accepted",
  "declined",
  "not_relevant",
  "archived",
]);

function sendRouteError(res: Response, error: unknown) {
  if (error instanceof OperationsError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ProviderError) {
    res.status(error.status === 401 || error.status === 403 ? error.status : 502)
      .json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "The operation failed. No external action was confirmed." });
}

function ownerId(req: Request) {
  return (req as OwnerRequest).ownerUserId!;
}

function readInquiryId(req: Request, res: Response) {
  const inquiryId = req.params.inquiryId;
  if (typeof inquiryId !== "string" || !inquiryIdPattern.test(inquiryId)) {
    res.status(400).json({ error: "A valid enquiry ID is required." });
    return null;
  }
  return inquiryId;
}

router.use(requireVantageOwner);

router.get("/vantage-ars/dashboard", async (_req, res) => {
  try {
    res.json(await getDashboard());
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/vantage-ars/inquiries/:inquiryId", async (req, res) => {
  const inquiryId = readInquiryId(req, res);
  if (!inquiryId) return;
  try {
    res.json(await getInquiry(inquiryId));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/vantage-ars/inquiries", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  if (!inquiryStatuses.has(status)) {
    res.status(400).json({ error: "The requested enquiry filter is not supported." });
    return;
  }
  const escalated = req.query.escalated === "true";
  const search = typeof req.query.search === "string" ? req.query.search : "";
  try {
    res.json(await listInquiries(status, escalated, search));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/vantage-ars/autonomous/run", async (_req, res) => {
  try {
    res.json(await runAutonomousCycle(ownerId(_req as Request)));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/vantage-ars/inquiries/sync", async (_req, res) => {
  try {
    res.json(await syncInquiries());
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/vantage-ars/audit-events", async (req, res) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
  try {
    res.json(await listAuditEvents(limit));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/vantage-ars/metrics", async (_req, res) => {
  try {
    res.json(await getAutonomousMetrics());
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/vantage-ars/export", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  if (!inquiryStatuses.has(status)) {
    res.status(400).json({ error: "The requested enquiry filter is not supported." });
    return;
  }
  const escalated = req.query.escalated === "true";
  const search = typeof req.query.search === "string" ? req.query.search : "";
  try {
    const rows = await listInquiries(status, escalated, search);
    const header = "id,customerName,customerEmail,subject,status,tags,priorityScore,urgency,sentiment,receivedAt\n";
    const lines = rows.map((row) =>
      [
        row.id,
        JSON.stringify(row.customerName),
        JSON.stringify(row.customerEmail),
        JSON.stringify(row.subject),
        row.status,
        JSON.stringify((row.tags ?? []).join("|")),
        row.priorityScore ?? "",
        row.urgency ?? "",
        row.sentiment ?? "",
        row.receivedAt,
      ].join(","),
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vantage-ars-inquiries.csv");
    res.send(header + lines.join("\n"));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/vantage-ars/automation/runs", async (req, res) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  try {
    res.json(await listAutomationRuns(limit));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/vantage-ars/automation", async (_req, res) => {
  try {
    res.json(await getAutomationSettings());
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.put("/vantage-ars/automation/bank-details", async (req, res) => {
  if (typeof req.body?.autonomousSendingEnabled !== "undefined" && typeof req.body.autonomousSendingEnabled !== "boolean") {
    res.status(400).json({ error: "Choose whether autonomous sending is enabled." });
    return;
  }
  try {
    res.json(
      await setAutomationBankDetails(
        req.body?.bankDetails,
        req.body?.autonomousSendingEnabled,
        ownerId(req),
      ),
    );
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/vantage-ars/automation/policy/test-webhook", async (req, res) => {
  try {
    res.json(await testAutomationWebhook(ownerId(req)));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.put("/vantage-ars/automation/policy", async (req, res) => {
  try {
    res.json(await setAutomationPolicy(req.body, ownerId(req)));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.put("/vantage-ars/automation", async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") {
    res.status(400).json({ error: "Choose whether to enable or pause inbox automation." });
    return;
  }
  try {
    res.json(await setAutomationEnabled(req.body.enabled, ownerId(req)));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/vantage-ars/inquiries/:inquiryId/crm-sync", async (req, res) => {
  const inquiryId = readInquiryId(req, res);
  if (!inquiryId) return;
  try {
    res.json(await syncInquiryToHubSpot(inquiryId, ownerId(req)));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/vantage-ars/inquiries/:inquiryId/accept", async (req, res) => {
  const inquiryId = readInquiryId(req, res);
  if (!inquiryId) return;
  try {
    res.json(await acceptQuote(inquiryId, ownerId(req)));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/vantage-ars/inquiries/:inquiryId/reprocess", async (req, res) => {
  const inquiryId = readInquiryId(req, res);
  if (!inquiryId) return;
  try {
    res.json(await reprocessInquiry(inquiryId, ownerId(req)));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/vantage-ars/inquiries/:inquiryId/preview", async (req, res) => {
  const inquiryId = readInquiryId(req, res);
  if (!inquiryId) return;
  try {
    res.json(await getQuotePreview(inquiryId, req.body?.bankDetails));
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/vantage-ars/inquiries/:inquiryId/decision", async (req, res) => {
  const inquiryId = readInquiryId(req, res);
  if (!inquiryId) return;
  const decision = req.body?.decision;
  if (decision !== "approve" && decision !== "decline") {
    res.status(400).json({ error: "Choose approve or decline for this quote." });
    return;
  }
  try {
    res.json(
      await decideQuote(
        inquiryId,
        ownerId(req),
        decision,
        req.body?.bankDetails,
      ),
    );
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
