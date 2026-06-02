// src/core/estimator.ts
// Implementa a formula da skill cost-estimation.

import { CostTable } from "./config";
import { Task } from "./types";

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
