"use strict";
// src/core/estimator.ts
// Estima consumo de cota em tokens/ACU. Valores monetarios ficam apenas como
// compatibilidade legada; o foco do produto e volume de cota.
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTaskQuota = estimateTaskQuota;
exports.estimateDemandQuota = estimateDemandQuota;
exports.estimateTask = estimateTask;
exports.estimateDemand = estimateDemand;
exports.crossesGate2 = crossesGate2;
exports.crossesQuotaGate2 = crossesQuotaGate2;
function estimateTaskQuota(task, cost) {
    const model = task.model ? cost.models[task.model] : undefined;
    const unit = model?.unit || task.quotaUnit || "token";
    const mult = cost.power_multiplier[task.power || "normal"] ?? 1.0;
    const size = task.size || "small";
    const base = unit === "acu"
        ? (cost.task_size_acu[size] ?? 0)
        : (cost.task_size_tokens[size] ?? 0);
    return { unit, amount: base * mult };
}
function estimateDemandQuota(tasks, cost) {
    const perTask = {};
    const byEngine = {};
    const totalByUnit = {};
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
function crossesQuotaGate2(task, cost) {
    const threshold = cost.quota_gate2_threshold;
    if (!threshold || !task.quotaUnit || task.estimatedQuota == null)
        return false;
    return task.estimatedQuota >= (threshold[task.quotaUnit] ?? Number.POSITIVE_INFINITY);
}
//# sourceMappingURL=estimator.js.map