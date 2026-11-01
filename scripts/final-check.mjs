#!/usr/bin/env node

import { execSync } from "node:child_process";

const REQUIRED = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "FOUNDER_EMAIL",
  "CRON_SECRET",
];

const missing = REQUIRED.filter((key) => !String(process.env[key] ?? "").trim());
const autonomyOn = String(process.env.AUTONOMY ?? "").trim().toLowerCase() === "on";

console.log("Vantage-ARS final launch check\n");
console.log(`AUTONOMY: ${autonomyOn ? "ON" : "OFF"}`);
console.log(`Expected production env: ${REQUIRED.join(", ")}`);
console.log("");

if (missing.length > 0) {
  console.error("Missing required production values:");
  for (const key of missing) {
    console.error(`  - ${key}`);
  }
  console.error("");
  console.error("Set the production env first, then rerun this command.");
  process.exit(1);
}

console.log("Production configuration: OK");
console.log("Running repo-wide validation ...");

try {
  execSync("npm run check", { stdio: "inherit" });
  console.log("\nFinal launch check: READY");
} catch (error) {
  console.error("\nFinal launch check: FAILED");
  process.exit(error && typeof error === "object" && "status" in error ? Number(error.status) : 1);
}
