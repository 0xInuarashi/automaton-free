/**
 * Tick Context
 *
 * Builds a shared context for each heartbeat tick.
 * Fetches credit balance ONCE per tick, derives survival tier,
 * and shares across all tasks to avoid redundant API calls.
 */

import type BetterSqlite3 from "better-sqlite3";
import type { Address } from "viem";
import type {
  ConwayClient,
  HeartbeatConfig,
  TickContext,
} from "../types.js";
import { getSurvivalTier } from "../conway/credits.js";
import { getUsdcBalance } from "../conway/x402.js";
import { createLogger } from "../observability/logger.js";

type DatabaseType = BetterSqlite3.Database;
const logger = createLogger("heartbeat.tick");

let counter = 0;
function generateTickId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  counter++;
  return `${timestamp}-${random}-${counter.toString(36)}`;
}

/**
 * Build a TickContext for the current tick.
 *
 * - Generates a unique tickId
 * - Fetches credit balance ONCE via conway.getCreditsBalance()
 * - Fetches USDC balance ONCE via getUsdcBalance()
 * - Derives survivalTier from credit balance
 * - Reads lowComputeMultiplier from config
 */
export async function buildTickContext(
  db: DatabaseType,
  conway: ConwayClient,
  config: HeartbeatConfig,
  walletAddress?: Address,
): Promise<TickContext> {
  const tickId = generateTickId();
  const startedAt = new Date();

  // Fetch balances ONCE
  let creditBalance = 0;
  try {
    creditBalance = await conway.getCreditsBalance();
  } catch (err: any) {
    logger.error("Failed to fetch credit balance", err instanceof Error ? err : undefined);
  }

  let usdcBalance = 0;
  if (walletAddress) {
    try {
      usdcBalance = await getUsdcBalance(walletAddress);
    } catch (err: any) {
      logger.error("Failed to fetch USDC balance", err instanceof Error ? err : undefined);
    }
  }

  const survivalTier = getSurvivalTier(creditBalance);
  const lowComputeMultiplier = config.lowComputeMultiplier ?? 4;

  // Check if free inference models exist in the model registry
  let freeInferenceAvailable = false;
  try {
    const row = db.prepare(
      "SELECT COUNT(*) AS count FROM model_registry WHERE enabled = 1 AND cost_per_1k_input = 0 AND cost_per_1k_output = 0",
    ).get() as { count: number } | undefined;
    freeInferenceAvailable = (row?.count ?? 0) > 0;
  } catch {
    // model_registry table may not exist yet
  }

  return {
    tickId,
    startedAt,
    creditBalance,
    usdcBalance,
    survivalTier,
    lowComputeMultiplier,
    freeInferenceAvailable,
    config,
    db,
  };
}
