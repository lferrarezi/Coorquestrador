// src/core/estimator.ts
// Estima consumo de cota em tokens/ACU. Valores monetarios ficam apenas como
// compatibilidade legada; o foco do produto e volume de cota.

import { CostTable } from "./config";
import { Task } from "./types";

export interface QuotaAmount {
  unit: "token" | "acu";
  amount: number;
}

export interface QuotaEstimate {
  perTask: Record<string, QuotaAmount>;
  byEngine: Record<string, QuotaAmount>;
  totalByUnit: Record<string, number>;
}

export function estimateTaskQuota(task: Task, cost: CostTable): QuotaAmount {
  const model = task.model ? cost.models[task.model] : undefined;
  const unit = model?.unit || task.quotaUnit || "token";
  const mult = cost.power_multiplier[task.power || "normal"] ?? 1.0;
  const size = task.size || "small";
  const base = unit === "acu"
    ? (cost.task_size_acu[size] ?? 0)
    : (cost.task_size_tokens[size] ?? 0);
  return { unit, amount: base * mult };
}

export function estimateDemandQuota(tasks: Task[], cost: CostTable): QuotaEstimate {
  const perTask: Record<string, QuotaAmount> = {};
  const byEngine: Record<string, QuotaAmount> = {};
  const totalByUnit: Record<string, number> = {};

  for (const t of tasks) {
    const q = estimateTaskQuota(t, cost);
    perTask[t.id] = q;
    totalByUnit[q.unit] = (totalByUnit[q.unit] || 0) + q.amount;
    if (t.engine) {
      const cur = byEngine[t.engine] || { unit: q.unit, amount: 0 };
      cur.amount += q.amount;
      byEngine[t.engine] = cur;
    }
  }

  return { perTask, byEngine, totalByUnit };
}

export function estimateTask(task: Task, cost: CostTable): number {
  if (!task.model || !task.power) return 0;
  const model = cost.models[task.model];
  if (!model) return 0;
  const mult = cost.power_multiplier[task.power] ?? 1.0;

  if (model.unit === "token") {
    const base = cost.task_size_tokens[task.size] ?? 0;
    const adj = base * mult;
    return (adj / 1_000_000) * (model.price_per_million ?? 0);
  } else {
    const base = cost.task_size_acu[task.size] ?? 0;
    const adj = base * mult;
    return adj * (model.price_per_acu ?? 0);
  }
}

export function estimateDemand(tasks: Task[], cost: CostTable): { perTask: Record<string, number>; total: number } {
  const perTask: Record<string, number> = {};
  let total = 0;
  for (const t of tasks) {
    const c = estimateTask(t, cost);
    perTask[t.id] = c;
    total += c;
  }
  return { perTask, total };
}

export function crossesGate2(total: number, cost: CostTable): boolean {
  return total >= cost.cost_gate2_threshold;
}

export function crossesQuotaGate2(task: Task, cost: CostTable): boolean {
  const threshold = cost.quota_gate2_threshold;
  if (!threshold || !task.quotaUnit || task.estimatedQuota == null) return false;
  return task.estimatedQuota >= (threshold[task.quotaUnit] ?? Number.POSITIVE_INFINITY);
}
