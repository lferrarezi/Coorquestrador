// src/ui/gates.ts
// Gates HITL via dialogos modais do VSCode.

import * as vscode from "vscode";
import { Demand, Task } from "../core/types";

function fmtQuota(amount: number, unit?: string): string {
  if (unit === "acu") return `${Math.round(amount * 10) / 10} ACU`;
  return `${Math.round(amount).toLocaleString("pt-BR")} tokens`;
}

/** Gate 1: aprova plano + consumo de cota antes de qualquer execucao. Obrigatorio na v1. */
export async function gate1PlanCost(demand: Demand): Promise<boolean> {
  const lines = demand.tasks.map(
    (t) =>
      `${t.id} [${t.status}] ${t.engine ?? "SEM-ENGINE"} ${t.model ?? ""} ${t.power ?? ""} ~${fmtQuota(t.estimatedQuota || 0, t.quotaUnit)}`
  );
  const blocked = demand.tasks.filter((t) => t.status === "bloqueada");
  const quota = Object.entries(demand.estimatedQuotaByEngine || {})
    .map(([engine, q]) => `${engine}: ${fmtQuota(q.amount, q.unit)}`)
    .join("\n");
  const detail =
    `Consumo de cota estimado:\n${quota || "n/d"}\n\n` +
    lines.join("\n") +
    (blocked.length ? `\n\n${blocked.length} tarefa(s) bloqueada(s) por falta de engine.` : "");

  const choice = await vscode.window.showWarningMessage(
    `Gate 1 — Aprovar plano e cota de "${demand.title}"?`,
    { modal: true, detail },
    "Aprovar e executar",
    "Replanejar"
  );
  return choice === "Aprovar e executar";
}

/** Gate 2: aprova entrega quando ha impacto (cota, prod, dados, commit). */
export async function gate2Delivery(task: Task, reasons: string[]): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    `Gate 2 — Aprovar entrega da tarefa ${task.id}?`,
    { modal: true, detail: `Motivos do gate: ${reasons.join(", ")}\n\nCota real: ${fmtQuota(task.realQuota || 0, task.quotaUnit)}` },
    "Aprovar entrega",
    "Rejeitar (retrabalho)"
  );
  return choice === "Aprovar entrega";
}
