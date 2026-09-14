import { assertRequiredEnv } from "../src/config/env.js";
import { logger } from "../src/utils/logger.js";

assertRequiredEnv();

// Dynamic for the same reason as server.js: readable env errors.
const { renewExpiringChannels } = await import("../src/services/driveWatch.service.js");

/**
 * Drive watch channels expire; when one lapses, notifications stop silently.
 * Run this on a schedule (see ForDev.md) — hourly is plenty.
 */
const results = await renewExpiringChannels();
logger.info("Channel renewal sweep finished", results);

process.exit(results.failed > 0 ? 1 : 0);
