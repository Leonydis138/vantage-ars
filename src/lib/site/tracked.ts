/**
 * The public paths worth measuring.
 *
 * One list, imported by the client beacon, the server writer and the build's
 * dev middleware, so a page can never be tracked in one place and ignored in
 * another. Adding a page here is the whole change.
 */
export const TRACKED_PATHS = [
  "/",
  "/services",
  "/find",
  "/assess",
  "/automation",
  "/rates",
  "/work",
  "/model",
  "/support",
  "/status",
  "/terms",
  "/privacy",
  "/services/voip",
  "/services/networking",
  "/services/it-infrastructure",
  "/services/ai-automation",
  "/services/managed-support",
  "/services/cloud-email",
  "/services/security",
  "/services/backup-recovery",
  "/guides",
  "/guides/one-way-audio",
  "/guides/backup-is-not-recovery",
  "/guides/wifi-drops",
  "/guides/change-without-rollback",
  "/guides/prepare-for-remote-support",
  "/guides/sip-alg-breaks-voip",
  "/tools/email-auth",
  "/tools/network-path",
] as const;

const TRACKED = new Set<string>(TRACKED_PATHS);

export function isTrackedPage(path: string): boolean {
  return TRACKED.has(path.split("?")[0].split("#")[0] || "/");
}
