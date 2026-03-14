/**
 * Automaton Process Manager
 *
 * Manages the automaton agent as a child process.
 * Supports start, stop, restart, and status queries.
 * Captures stdout/stderr and forwards to log listeners.
 */

import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("dashboard.process");

export interface ProcessInfo {
  status: "stopped" | "running" | "starting" | "stopping";
  pid: number | null;
  uptimeMs: number | null;
  startedAt: string | null;
  restartCount: number;
  lastExitCode: number | null;
  memoryMb: number | null;
  cpuPercent: number | null;
}

export class ProcessManager extends EventEmitter {
  private proc: ChildProcess | null = null;
  private status: ProcessInfo["status"] = "stopped";
  private startedAt: Date | null = null;
  private restartCount = 0;
  private lastExitCode: number | null = null;
  private entryPoint: string;
  private envVars: Record<string, string>;

  constructor(entryPoint: string, envVars: Record<string, string> = {}) {
    super();
    this.entryPoint = entryPoint;
    this.envVars = envVars;
  }

  start(): boolean {
    if (this.proc && this.status === "running") {
      return false; // already running
    }

    this.status = "starting";
    this.emit("status", this.status);

    try {
      this.proc = spawn("node", [this.entryPoint, "--run"], {
        env: { ...process.env, ...this.envVars, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
        cwd: process.cwd(),
      });

      this.startedAt = new Date();
      this.status = "running";
      this.emit("status", this.status);

      logger.info(`Automaton started (PID ${this.proc.pid})`);

      this.proc.stdout?.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          this.emit("log", line);
        }
      });

      this.proc.stderr?.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          this.emit("log", line);
        }
      });

      this.proc.on("exit", (code, signal) => {
        this.lastExitCode = code;
        this.status = "stopped";
        this.proc = null;
        this.emit("status", this.status);
        this.emit("exit", { code, signal });
        logger.info(`Automaton exited (code=${code}, signal=${signal})`);
      });

      this.proc.on("error", (err) => {
        logger.error("Automaton process error", err);
        this.status = "stopped";
        this.proc = null;
        this.emit("status", this.status);
        this.emit("error", err);
      });

      return true;
    } catch (err: any) {
      logger.error("Failed to start automaton", err);
      this.status = "stopped";
      this.emit("status", this.status);
      return false;
    }
  }

  async stop(): Promise<boolean> {
    if (!this.proc || this.status !== "running") {
      return false;
    }

    this.status = "stopping";
    this.emit("status", this.status);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if SIGTERM didn't work
        if (this.proc) {
          logger.warn("Force-killing automaton (SIGKILL)");
          this.proc.kill("SIGKILL");
        }
        resolve(true);
      }, 10_000);

      this.proc!.once("exit", () => {
        clearTimeout(timeout);
        resolve(true);
      });

      this.proc!.kill("SIGTERM");
    });
  }

  async restart(): Promise<boolean> {
    await this.stop();
    // Brief pause to let port/DB handles release
    await new Promise((r) => setTimeout(r, 1000));
    this.restartCount++;
    return this.start();
  }

  getInfo(): ProcessInfo {
    let memoryMb: number | null = null;
    let cpuPercent: number | null = null;

    // Try to read /proc/<pid>/stat for memory (Linux only)
    if (this.proc?.pid) {
      try {
        const { rss } = process.memoryUsage();
        memoryMb = Math.round(rss / 1024 / 1024);
      } catch {
        // ignore
      }
    }

    return {
      status: this.status,
      pid: this.proc?.pid ?? null,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt.getTime() : null,
      startedAt: this.startedAt?.toISOString() ?? null,
      restartCount: this.restartCount,
      lastExitCode: this.lastExitCode,
      memoryMb,
      cpuPercent,
    };
  }

  isRunning(): boolean {
    return this.status === "running" && this.proc !== null;
  }
}
