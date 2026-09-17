import { env, assertRequiredEnv, productionConfigProblems } from "./src/config/env.js";
import { logger } from "./src/utils/logger.js";

assertRequiredEnv();

for (const problem of productionConfigProblems()) {
  logger.error("Production config problem", { problem });
}

// Imported dynamically, after the check above: the app pulls in clients that
// validate their own config on construction, and their errors are far less
// readable than a list of the env vars you actually forgot.
const { createApp } = await import("./src/app.js");
const { startAutoSync } = await import("./src/services/autoSync.service.js");
const { startChannelRenewal, convertPollingChannels } = await import("./src/services/driveWatch.service.js");

createApp().listen(env.port, () => {
  logger.info("DriveTag AI backend started", { port: env.port, nodeEnv: env.nodeEnv });
  startAutoSync();

  // Production only: a local backend pointed at the production database must not
  // renew or convert production users' channels.
  if (env.nodeEnv === "production") {
    startChannelRenewal();
    if (!(env.autoSync.intervalSeconds > 0)) {
      convertPollingChannels().catch((err) => {
        logger.error("Polling channel conversion failed", { reason: err.message });
      });
    }
  }
});
