import { Router, type IRouter, type Request, type Response } from "express";
import { requireVantageOwner, type OwnerRequest } from "../middlewares/requireVantageOwner";
import {
  decideQuote,
  getAutomationSettings,
  getDashboard,
  getQuotePreview,
  listInquiries,
  OperationsError,
  setAutomationEnabled,
  syncInquiryToHubSpot,
  syncInquiries,
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
  "declined",
  "not_relevant",
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

router.get("/vantage-ars/inquiries", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  if (!inquiryStatuses.has(status)) {
    res.status(400).json({ error: "The requested enquiry filter is not supported." });
    return;
  }
  try {
    res.json(await listInquiries(status));
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

router.get("/vantage-ars/automation", async (_req, res) => {
  try {
    res.json(await getAutomationSettings());
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
