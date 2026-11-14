import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { getMailboxEmail } from "../services/vantage-ars/providers";

export type OwnerRequest = Parameters<RequestHandler>[0] & {
  ownerUserId?: string;
};

export const requireVantageOwner: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Sign in to access Vantage ARS operations." });
    return;
  }

  const claims = auth.sessionClaims as Record<string, unknown> | null;
  const sessionEmail =
    typeof claims?.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!sessionEmail) {
    res.status(403).json({
      error: "This account has no verified email claim and cannot access operations.",
    });
    return;
  }

  try {
    const mailboxEmail = await getMailboxEmail();
    if (sessionEmail !== mailboxEmail) {
      res.status(403).json({
        error: "Access is limited to the owner of the connected business mailbox.",
      });
      return;
    }
    (req as OwnerRequest).ownerUserId = auth.userId;
    next();
  } catch {
    res.status(503).json({
      error: "The connected business mailbox could not be verified. Operations are locked.",
    });
  }
};
