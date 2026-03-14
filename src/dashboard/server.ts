/**
 * Automaton Dashboard Server
 *
 * HTTP + WebSocket server for the web dashboard.
 * - Serves static HTML/CSS/JS dashboard
 * - REST API for status/goals/tasks/events/logs
 * - WebSocket for live log streaming
 * - Process management (start/stop/restart)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { ProcessManager } from "./process-manager.js";
import { createApiRoutes, matchRoute } from "./api.js";
import { createLogger, StructuredLogger } from "../observability/logger.js";
import { prettySink } from "../observability/pretty-sink.js";
import { getDashboardHtml } from "./frontend.js";
import type { LogEntry } from "../types.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const logger = createLogger("dashboard");

// ─── Log Ring Buffer ──────────────────────────────────────────

export class LogRingBuffer {
  private buffer: LogEntry[] = [];
  private maxSize: number;

  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
  }

  push(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize);
    }
  }

  getAll(): LogEntry[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  get length(): number {
    return this.buffer.length;
  }
}

// ─── Dashboard Server ─────────────────────────────────────────

export interface DashboardOptions {
  port: number;
  host: string;
  entryPoint: string;
  autoStart: boolean;
  autoRestart?: boolean;
  envVars?: Record<string, string>;
}

export async function startDashboard(options: DashboardOptions): Promise<void> {
  const { port, host, entryPoint, autoStart, autoRestart = true, envVars } = options;

  // Create process manager
  const processManager = new ProcessManager(entryPoint, envVars, autoRestart);
  const logBuffer = new LogRingBuffer(5000);

  // WebSocket clients for live log streaming
  const wsClients = new Set<WebSocket>();

  // The child process outputs raw JSON log lines — parse and forward them
  processManager.on("log", (line: string) => {
    try {
      const entry = JSON.parse(line) as LogEntry;
      logBuffer.push(entry);

      // Broadcast to all WebSocket clients
      const msg = JSON.stringify({ type: "log", data: entry });
      for (const ws of wsClients) {
        if (ws.readyState === 1) {
          ws.send(msg);
        }
      }
    } catch {
      // Non-JSON output (e.g. native error), wrap it
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "info",
        module: "stdout",
        message: line,
      };
      logBuffer.push(entry);

      const msg = JSON.stringify({ type: "log", data: entry });
      for (const ws of wsClients) {
        if (ws.readyState === 1) {
          ws.send(msg);
        }
      }
    }
  });

  // Forward process status changes to WebSocket clients
  processManager.on("status", (status: string) => {
    const msg = JSON.stringify({ type: "status", data: { status } });
    for (const ws of wsClients) {
      if (ws.readyState === 1) {
        ws.send(msg);
      }
    }
  });

  // Create API routes
  const routes = createApiRoutes(processManager, logBuffer);

  // Create HTTP server
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    // API routes
    if (pathname.startsWith("/api/")) {
      const match = matchRoute(routes, req.method || "GET", pathname);
      if (match) {
        try {
          await match.handler(req, res, match.params);
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Serve dashboard HTML for everything else
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(getDashboardHtml());
  });

  // WebSocket server for live logs
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket) => {
    wsClients.add(ws);
    logger.info(`Dashboard WebSocket client connected (${wsClients.size} total)`);

    // Send current process status immediately
    ws.send(JSON.stringify({
      type: "status",
      data: processManager.getInfo(),
    }));

    // Send recent logs
    const recentLogs = logBuffer.getAll().slice(-100);
    for (const entry of recentLogs) {
      ws.send(JSON.stringify({ type: "log", data: entry }));
    }

    ws.on("close", () => {
      wsClients.delete(ws);
    });

    ws.on("error", () => {
      wsClients.delete(ws);
    });
  });

  // Start HTTP server
  server.listen(port, host, () => {
    const addr = host === "0.0.0.0" ? "all interfaces" : host;
    logger.info(`Dashboard running at http://${host}:${port} (listening on ${addr})`);
    console.log(`\n  🤖 Automaton Dashboard: http://${host}:${port}\n`);
  });

  // Auto-start the automaton if requested
  if (autoStart) {
    logger.info("Auto-starting automaton process...");
    processManager.start();
  }

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Dashboard shutting down...");
    processManager.stop().then(() => {
      server.close();
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Keep alive
  await new Promise(() => {});
}
