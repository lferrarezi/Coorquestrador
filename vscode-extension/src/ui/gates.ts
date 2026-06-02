// src/ui/gates.ts
// Gates HITL via dialogos modais do VSCode.

import * as vscode from "vscode";
import { Demand, Task } from "../core/types";

function fmt(n: number): string {
  return n.toFixed(2);
}

/** Gate 1: aprova plano + custo antes de qualquer execucao. Obrigatorio na v1. */
export async function gate1PlanCost(demand: Demand): Promise<boolean> {
  const lines = demand.tasks.map(
    (t) =>
      `${t.id} [${t.status}] ${t.engine ?? "SEM-ENGINE"} ${t.model ?? ""} ${t.power ?? ""} ~$${fmt(t.estimatedCost || 0)}`
  );
  const blocked = demand.tasks.filter((t) => t.status === "bloqueada");
  const detail =
    lines.join("\n") +
    `\n\nTotal estimado: $${fmt(demand.estimatedTotal || 0)}` +
    (blocked.length ? `\n\n${blocked.length} tarefa(s) bloqueada(s) por falta de engine.` : "");

  const choice = await vscode.window.showWarningMessage(
    `Gate 1 — Aprovar plano e custo de "${demand.title}"?`,
    { modal: true, detail },
    "Aprovar e executar",
    "Replanejar"
  );
  return choice === "Aprovar e executar";
}

/** Gate 2: aprova entrega quando ha impacto (custo, prod, dados, commit). */
export async function gate2Delivery(task: Task, reasons: string[]): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    `Gate 2 — Aprovar entrega da tarefa ${task.id}?`,
    { modal: true, detail: `Motivos do gate: ${reasons.join(", ")}\n\nCusto real: $${(task.realCost || 0).toFixed(2)}` },
    "Aprovar entrega",
    "Rejeitar (retrabalho)"
  );
  return choice === "Aprovar entrega";
}
