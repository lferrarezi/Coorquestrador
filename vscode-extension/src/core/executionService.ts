// src/core/executionService.ts
// Servico compartilhado para executar demandas, persistir logs e finalizar Gate 2.

import * as fs from "fs";
import * as path from "path";
import { EnginesFile, CostTable } from "./config";
import { buildCommand } from "./commandBuilder";
import { redactCommand, redactSecrets } from "./commandSecurity";
import { DemandStore } from "./demandStore";
import { executePlan, ExecResult, ExecutionController } from "./executor";
import { crossesGate2, crossesQuotaGate2 } from "./estimator";
import { HistoryStore } from "./historyStore";
import { measureUsage } from "./usageParser";
import { reviewTask, ReviewVerdict } from "./reviewer";
import { Demand, Task } from "./types";

export interface ExecutionUpdate {
  task: Task;
  demand: Demand;
}

export interface TaskReview {
  task: Task;
  reasons: string[];
  /** parecer do revisor automatizado, quando habilitado */
  verdict?: ReviewVerdict;
}

export interface RunDemandOptions {
  demand: Demand;
  store: DemandStore;
  enginesFile: EnginesFile;
  costTable: CostTable;
  root: string;
  configDir: string;
  maxParallel: number;
  gate1Approved: boolean;
  onUpdate: (update: ExecutionUpdate) => void;
  reviewGate2?: (review: TaskReview) => Promise<boolean>;
  /** cancela execucoes em andamento (botao Parar) */
  controller?: ExecutionController;
  /** stream de saida por tarefa, para UI ao vivo */
  onOutput?: (taskId: string, chunk: string) => void;
  /** roda o revisor automatizado antes do Gate 2 (default: true) */
  autoReview?: boolean;
}

export interface RunDemandResult {
  demand: Demand;
  results: ExecResult[];
}

function sddForTask(t: Task): string {
  return `# Tarefa ${t.id}\n${t.description}\n\n## Criterio de aceite\n${t.acceptance}`;
}

export function gate2ReasonsForTask(t: Task, cost: CostTable): string[] {
  const reasons: string[] = [];
  if (crossesQuotaGate2(t, cost) || crossesGate2(t.estimatedCost || 0, cost)) {
    reasons.push("consumo de cota acima do teto");
  }
  if (t.criticality === "alta" || t.criticality === "critica") {
    reasons.push("criticidade alta");
  }
  if ((t.artifacts || []).length > 0) {
    reasons.push("artefatos gerados ou alterados");
  }
  if ((t.log || "").toLowerCase().includes("error")) {
    reasons.push("log de execucao contem erro");
  }
  if (/\b(commit|modified|created|deleted|write|overwrite)\b/i.test(t.log || "")) {
    reasons.push("impacto em arquivos detectado no log");
  }
  return reasons;
}

function persistTaskLog(logDir: string, task: Task, result: ExecResult) {
  fs.mkdirSync(logDir, { recursive: true });
  const file = path.join(logDir, `${task.id}.log`);
  const body = [
    `task: ${task.id}`,
    `engine: ${task.engine || ""}`,
    `model: ${task.model || ""}`,
    `power: ${task.power || ""}`,
    `exit_code: ${result.code}`,
    `duration_ms: ${result.durationMs}`,
    `command: ${redactCommand((task as any).redactedCommand || task.command || "")}`,
    "",
    "----- stdout -----",
    redactSecrets(result.stdout),
    "",
    "----- stderr -----",
    redactSecrets(result.stderr),
  ].join("\n");
  fs.writeFileSync(file, body, "utf8");
  task.logFile = file;
  task.durationMs = result.durationMs;
}

export async function runDemandExecution(opts: RunDemandOptions): Promise<RunDemandResult> {
  const demand = opts.demand;
  demand.tasks.forEach((t) => { if (t.status === "planejada") t.status = "aprovada"; });
  demand.status = "em-execucao";
  opts.store.upsert(demand);

  const cwd = path.join(opts.root, demand.project);
  const specDir = path.join(opts.root, opts.configDir, "specs", demand.id);
  const logDir = path.join(opts.root, opts.configDir, "logs", demand.id);

  const history = new HistoryStore(path.join(opts.root, opts.configDir, "state", "history.json"));

  const results = await executePlan({
    tasks: demand.tasks,
    cwd,
    maxParallel: Math.min(opts.maxParallel, opts.enginesFile.defaults.max_parallel),
    execTimeoutSec: opts.enginesFile.defaults.exec_timeout_seconds,
    gate1Approved: opts.gate1Approved,
    controller: opts.controller,
    onOutput: opts.onOutput,
    buildFn: (t) => buildCommand(t, opts.enginesFile.engines[t.engine!], sddForTask(t), cwd, specDir),
    onUpdate: (t) => {
      opts.store.upsert(demand);
      opts.onUpdate({ task: t, demand });
    },
  });

  for (const result of results) {
    const task = demand.tasks.find((t) => t.id === result.taskId);
    if (!task) continue;
    persistTaskLog(logDir, task, result);

    // cota REAL medida do stdout (quando o CLI reporta usage); senao mantem estimativa.
    const engineCfg = task.engine ? opts.enginesFile.engines[task.engine] : undefined;
    const measured = measureUsage(engineCfg, `${result.stdout}\n${result.stderr}`);
    if (measured) {
      task.realQuota = measured.amount;
      task.quotaUnit = measured.unit;
      task.realQuotaMeasured = true;
    }

    history.appendExecution({
      demandId: demand.id,
      taskId: task.id,
      engine: task.engine || "",
      model: task.model || "",
      power: task.power || "",
      size: task.size,
      unit: task.quotaUnit || engineCfg?.unit || "token",
      estimatedQuota: task.estimatedQuota || 0,
      realQuota: measured ? measured.amount : null,
      measured: !!measured,
      exitCode: result.code,
      durationMs: result.durationMs,
      finishedAt: new Date().toISOString(),
    });
  }

  for (const task of demand.tasks.filter((t) => t.status === "revisao")) {
    const reasons = gate2ReasonsForTask(task, opts.costTable);

    // revisor automatizado (assistente barato) compara resultado vs aceite.
    let verdict: ReviewVerdict | undefined;
    if (opts.autoReview !== false && !opts.controller?.cancelled) {
      verdict = await reviewTask(task, opts.enginesFile, cwd);
      task.reviewVerdict = verdict;
      if (!verdict.ok) reasons.push(`revisor automatizado reprovou: ${verdict.summary}`);
    }

    let approved = true;
    if (reasons.length && opts.reviewGate2) {
      approved = await opts.reviewGate2({ task, reasons, verdict });
    }
    task.status = approved ? "concluida" : "rejeitada";
    task.realQuota = task.realQuota ?? task.estimatedQuota;
    task.realCost = task.realCost ?? task.estimatedCost;
    opts.store.upsert(demand);
    opts.onUpdate({ task, demand });
  }

  opts.store.reconcile(demand.id);
  return { demand: opts.store.get(demand.id) || demand, results };
}
