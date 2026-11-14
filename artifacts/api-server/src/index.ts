import app from "./app";
import { logger } from "./lib/logger";
import { runAutomationPoll } from "./services/vantage-ars/operations";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  const timer = setInterval(() => {
    void runAutomationPoll().catch((error: unknown) => {
      logger.error({ err: error }, "Automation poll failed");
    });
  }, 60_000);
  timer.unref();
});
