import app from "./app";
import { logger } from "./lib/logger";
import { runAutomationPoll } from "./services/vantage-ars/operations";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void runAutomationPoll().catch((error: unknown) => {
    logger.error({ err: error }, "Initial automation poll failed");
  });
  const timer = setInterval(() => {
    void runAutomationPoll().catch((error: unknown) => {
      logger.error({ err: error }, "Automation poll failed");
    });
  }, 60_000);
  timer.unref();

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down");
    clearInterval(timer);
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
