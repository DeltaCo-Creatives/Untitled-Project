import { env, assertRequiredEnv } from "./src/config/env.js";
import { logger } from "./src/utils/logger.js";

assertRequiredEnv();

// Imported dynamically, after the check above: the app pulls in clients that
// validate their own config on construction, and their errors are far less
// readable than a list of the env vars you actually forgot.
const { createApp } = await import("./src/app.js");
const { startAutoSync } = await import("./src/services/autoSync.service.js");

createApp().listen(env.port, () => {
  logger.info("DriveTag AI backend started", { port: env.port, nodeEnv: env.nodeEnv });
  startAutoSync();
});
