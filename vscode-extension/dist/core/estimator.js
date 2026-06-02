"use strict";
// src/core/estimator.ts
// Implementa a formula da skill cost-estimation.
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTask = estimateTask;
exports.estimateDemand = estimateDemand;
exports.crossesGate2 = crossesGate2;
function estimateTask(task, cost) {
    if (!task.model || !task.power)
        return 0;
    const model = cost.models[task.model];
    if (!model)
        return 0;
    const mult = cost.power_multiplier[task.power] ?? 1.0;
    if (model.unit === "token") {
        const base = cost.task_size_tokens[task.size] ?? 0;
        const adj = base * mult;
        return (adj / 1000000) * (model.price_per_million ?? 0);
    }
    else {
        const base = cost.task_size_acu[task.size] ?? 0;
        const adj = base * mult;
        return adj * (model.price_per_acu ?? 0);
    }
}
function estimateDemand(tasks, cost) {
    const perTask = {};
    let total = 0;
    for (const t of tasks) {
        const c = estimateTask(t, cost);
        perTask[t.id] = c;
        total += c;
    }
    return { perTask, total };
}
function crossesGate2(total, cost) {
    return total >= cost.cost_gate2_threshold;
}
//# sourceMappingURL=estimator.js.map