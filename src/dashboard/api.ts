/**
 * Dashboard REST API
 *
 * Provides JSON endpoints for reading automaton state,
 * goals, tasks, events, logs, and process management.
 */

import type { IncomingMessage, ServerResponse } from "http";
import { createDatabase } from "../state/database.js";
import {
  getActiveGoals,
  getGoalById,
  getTasksByGoal,
  getReadyTasks,
  getRecentEvents,
  getEventsByType,
  getHeartbeatSchedule,
  getHeartbeatHistory,
  searchKnowledge,
} from "../state/database.js";
import { loadConfig, resolvePath } from "../config.js";
import type { ProcessManager } from "./process-manager.js";
import type { LogRingBuffer } from "./server.js";

export type ApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => Promise<void> | void;

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function error(res: ServerResponse, msg: string, status = 500): void {
  json(res, { error: msg }, status);
}

/**
 * Opens a READ-ONLY handle to the automaton database.
 * The dashboard never writes to the agent's DB.
 */
function openDb() {
  const config = loadConfig();
  if (!config) return null;
  const dbPath = resolvePath(config.dbPath);
  return createDatabase(dbPath);
}

export function createApiRoutes(
  processManager: ProcessManager,
  logBuffer: LogRingBuffer,
): Map<string, ApiHandler> {
  const routes = new Map<string, ApiHandler>();

  // ─── Process Management ────────────────────────────────────

  routes.set("GET /api/process", (_req, res) => {
    json(res, processManager.getInfo());
  });

  routes.set("POST /api/process/start", async (_req, res) => {
    const ok = processManager.start();
    json(res, { success: ok, info: processManager.getInfo() });
  });

  routes.set("POST /api/process/stop", async (_req, res) => {
    const ok = await processManager.stop();
    json(res, { success: ok, info: processManager.getInfo() });
  });

  routes.set("POST /api/process/restart", async (_req, res) => {
    const ok = await processManager.restart();
    json(res, { success: ok, info: processManager.getInfo() });
  });

  // ─── Status Overview ───────────────────────────────────────

  routes.set("GET /api/status", (_req, res) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      const config = loadConfig()!;
      const state = db.getAgentState();
      const turnCount = db.getTurnCount();
      const tools = db.getInstalledTools();
      const skills = db.getSkills(true);
      const children = db.getChildren();
      const registry = db.getRegistryEntry();
      const recentTurns = db.getRecentTurns(5);

      json(res, {
        name: config.name,
        address: config.walletAddress,
        creator: config.creatorAddress,
        model: config.inferenceModel,
        version: config.version,
        state,
        turnCount,
        toolCount: tools.length,
        skillCount: skills.length,
        childrenAlive: children.filter((c) => c.status !== "dead").length,
        childrenTotal: children.length,
        agentId: registry?.agentId || null,
        recentTurns: recentTurns.map((t) => ({
          id: t.id,
          toolCalls: t.toolCalls?.length ?? 0,
          tokens: t.tokenUsage?.totalTokens ?? 0,
          timestamp: t.timestamp,
        })),
        process: processManager.getInfo(),
      });
    } finally {
      db.close();
    }
  });

  // ─── Goals ─────────────────────────────────────────────────

  routes.set("GET /api/goals", (_req, res) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      const goals = getActiveGoals(db.raw);
      json(res, goals);
    } finally {
      db.close();
    }
  });

  routes.set("GET /api/goals/:id", (_req, res, params) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      const goal = getGoalById(db.raw, params.id);
      if (!goal) return error(res, "Goal not found", 404);
      const tasks = getTasksByGoal(db.raw, params.id);
      json(res, { ...goal, tasks });
    } finally {
      db.close();
    }
  });

  // ─── Tasks ─────────────────────────────────────────────────

  routes.set("GET /api/tasks/ready", (_req, res) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      json(res, getReadyTasks(db.raw));
    } finally {
      db.close();
    }
  });

  // ─── Events ────────────────────────────────────────────────

  routes.set("GET /api/events", (req, res) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const type = url.searchParams.get("type");
      const limit = parseInt(url.searchParams.get("limit") || "100", 10);
      const config = loadConfig()!;

      if (type) {
        json(res, getEventsByType(db.raw, type, undefined, limit));
      } else {
        json(res, getRecentEvents(db.raw, config.walletAddress, limit));
      }
    } finally {
      db.close();
    }
  });

  // ─── Turns ─────────────────────────────────────────────────

  routes.set("GET /api/turns", (req, res) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const turns = db.getRecentTurns(Math.min(limit, 500));
      json(res, turns);
    } finally {
      db.close();
    }
  });

  routes.set("GET /api/turns/:id", (_req, res, params) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      const turn = db.getTurnById(params.id);
      if (!turn) return error(res, "Turn not found", 404);
      const toolCalls = db.getToolCallsForTurn(params.id);
      json(res, { ...turn, toolCallDetails: toolCalls });
    } finally {
      db.close();
    }
  });

  // ─── Heartbeat ─────────────────────────────────────────────

  routes.set("GET /api/heartbeat", (_req, res) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      const schedule = getHeartbeatSchedule(db.raw);
      // Get history for each scheduled task
      const history = schedule.flatMap((s) => getHeartbeatHistory(db.raw, s.taskName, 10));
      json(res, { schedule, history });
    } finally {
      db.close();
    }
  });

  // ─── Knowledge ─────────────────────────────────────────────

  routes.set("GET /api/knowledge", (req, res) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const q = url.searchParams.get("q");
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);

      if (q) {
        json(res, searchKnowledge(db.raw, q, undefined, limit));
      } else {
        // No search query — return recent knowledge entries
        const rows = db.raw.prepare(
          "SELECT * FROM knowledge_store WHERE (expires_at IS NULL OR expires_at >= ?) ORDER BY last_verified DESC LIMIT ?"
        ).all(new Date().toISOString(), limit);
        json(res, rows);
      }
    } finally {
      db.close();
    }
  });

  // ─── KV Store ──────────────────────────────────────────────

  routes.set("GET /api/kv", (_req, res) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      // Read all KV pairs
      const stmt = db.raw.prepare("SELECT key, value FROM kv_store ORDER BY key");
      const rows = stmt.all() as { key: string; value: string }[];
      json(res, rows);
    } finally {
      db.close();
    }
  });

  // ─── Skills ────────────────────────────────────────────────

  routes.set("GET /api/skills", (_req, res) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      json(res, db.getSkills());
    } finally {
      db.close();
    }
  });

  // ─── Tools ─────────────────────────────────────────────────

  routes.set("GET /api/tools", (_req, res) => {
    const db = openDb();
    if (!db) return error(res, "No config found", 503);
    try {
      json(res, db.getInstalledTools());
    } finally {
      db.close();
    }
  });

  // ─── Recent Logs (from ring buffer) ────────────────────────

  routes.set("GET /api/logs", (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get("limit") || "200", 10);
    const entries = logBuffer.getAll().slice(-limit);
    json(res, entries);
  });

  // ─── SOUL.md ───────────────────────────────────────────────

  routes.set("GET /api/soul", async (_req, res) => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const homeDir = process.env.HOME || "/root";
      const soulPath = path.join(homeDir, ".automaton", "SOUL.md");
      const content = fs.readFileSync(soulPath, "utf-8");
      json(res, { content });
    } catch {
      error(res, "SOUL.md not found", 404);
    }
  });

  // ─── Config (read-only, redacted) ──────────────────────────

  routes.set("GET /api/config", (_req, res) => {
    const config = loadConfig();
    if (!config) return error(res, "No config found", 503);

    // Redact sensitive keys
    const safe = {
      name: config.name,
      inferenceModel: config.inferenceModel,
      maxTokensPerTurn: config.maxTokensPerTurn,
      version: config.version,
      logLevel: config.logLevel,
      walletAddress: config.walletAddress,
      creatorAddress: config.creatorAddress,
      conwayApiUrl: config.conwayApiUrl,
      modelStrategy: config.modelStrategy,
      treasuryPolicy: config.treasuryPolicy,
      maxChildren: config.maxChildren,
      maxTurnsPerCycle: config.maxTurnsPerCycle,
      genesisPrompt: config.genesisPrompt,
      hasOpenaiKey: !!config.openaiApiKey,
      hasAnthropicKey: !!config.anthropicApiKey,
      hasOpenrouterKey: !!config.openrouterApiKey,
      hasOllamaUrl: !!config.ollamaBaseUrl,
    };
    json(res, safe);
  });

  return routes;
}

/**
 * Simple path-param matcher.
 * Matches patterns like "GET /api/goals/:id" against "GET /api/goals/abc123"
 */
export function matchRoute(
  routes: Map<string, ApiHandler>,
  method: string,
  pathname: string,
): { handler: ApiHandler; params: Record<string, string> } | null {
  const key = `${method} ${pathname}`;

  // Exact match first
  const exact = routes.get(key);
  if (exact) return { handler: exact, params: {} };

  // Param matching
  for (const [pattern, handler] of routes) {
    const [pMethod, pPath] = pattern.split(" ", 2);
    if (pMethod !== method) continue;

    const patternParts = pPath.split("/");
    const pathParts = pathname.split("/");
    if (patternParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let match = true;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(":")) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) return { handler, params };
  }

  return null;
}
