"use strict";
// src/core/planValidation.ts
// Validacao deterministica do plano retornado pelo agente planejador.
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePlan = validatePlan;
const SIZES = ["trivial", "small", "medium", "large", "xlarge"];
const CRITICALITIES = ["baixa", "normal", "alta", "critica"];
function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
}
function normalizeSize(size) {
    const map = {
        XS: "trivial",
        S: "small",
        M: "medium",
        L: "large",
        XL: "xlarge",
    };
    if (!size)
        return undefined;
    return SIZES.includes(size) ? size : map[size];
}
function hasCycle(tasks) {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
        if (visited.has(id))
            return false;
        if (visiting.has(id))
            return true;
        visiting.add(id);
        const t = byId.get(id);
        for (const dep of t?.dependsOn || []) {
            if (byId.has(dep) && visit(dep))
                return true;
        }
        visiting.delete(id);
        visited.add(id);
        return false;
    };
    return tasks.some((t) => visit(t.id));
}
function validatePlan(tasks, enginesFile, snapshots, minCreditThreshold = enginesFile.defaults.min_credit_threshold) {
    const errors = [];
    const warnings = [];
    const ids = new Set();
    const available = new Map(snapshots.map((s) => [s.id, s]));
    if (!Array.isArray(tasks) || tasks.length === 0) {
        errors.push("Plano sem tarefas.");
        return { valid: false, errors, warnings };
    }
    for (const [i, t] of tasks.entries()) {
        const label = t?.id || `indice ${i}`;
        if (!isNonEmptyString(t.id))
            errors.push(`Tarefa ${i} sem id.`);
        else if (ids.has(t.id))
            errors.push(`Id de tarefa duplicado: ${t.id}.`);
        else
            ids.add(t.id);
        if (!isNonEmptyString(t.activity))
            warnings.push(`Tarefa ${label} sem activity.`);
        if (!isNonEmptyString(t.description))
            errors.push(`Tarefa ${label} sem description.`);
        if (!isNonEmptyString(t.acceptance))
            errors.push(`Tarefa ${label} sem acceptance.`);
        if (!normalizeSize(t.size))
            errors.push(`Tarefa ${label} com size invalido: ${t.size}.`);
        if (!CRITICALITIES.includes(t.criticality))
            errors.push(`Tarefa ${label} com criticality invalida: ${t.criticality}.`);
        if (!Array.isArray(t.dependsOn))
            errors.push(`Tarefa ${label} com dependsOn invalido.`);
        if (!t.engine) {
            warnings.push(`Tarefa ${label} sem assistente viavel; ficara bloqueada.`);
            continue;
        }
        const engineCfg = enginesFile.engines[t.engine];
        if (!engineCfg) {
            errors.push(`Tarefa ${label} usa assistente nao declarado: ${t.engine}.`);
            continue;
        }
        if (engineCfg.enabled === false)
            errors.push(`Tarefa ${label} usa assistente desabilitado: ${t.engine}.`);
        const snap = available.get(t.engine);
        if (!snap)
            errors.push(`Tarefa ${label} usa assistente sem snapshot de probe: ${t.engine}.`);
        else {
            if (snap.state !== "disponivel")
                errors.push(`Tarefa ${label} usa assistente indisponivel: ${t.engine} (${snap.state}).`);
            if (snap.creditRemaining !== null && snap.creditRemaining <= minCreditThreshold) {
                errors.push(`Tarefa ${label} usa assistente abaixo da cota minima: ${t.engine}.`);
            }
        }
        if (!t.model)
            errors.push(`Tarefa ${label} sem model.`);
        else if (!engineCfg.models.includes(t.model))
            errors.push(`Tarefa ${label} usa modelo invalido para ${t.engine}: ${t.model}.`);
        if (!t.power)
            errors.push(`Tarefa ${label} sem power.`);
        else if (!engineCfg.powers.includes(t.power))
            errors.push(`Tarefa ${label} usa esforco invalido para ${t.engine}: ${t.power}.`);
    }
    for (const t of tasks) {
        for (const dep of t.dependsOn || []) {
            if (!ids.has(dep))
                errors.push(`Tarefa ${t.id} depende de tarefa inexistente: ${dep}.`);
        }
    }
    if (hasCycle(tasks))
        errors.push("Plano contem ciclo no DAG de dependencias.");
    return { valid: errors.length === 0, errors, warnings };
}
//# sourceMappingURL=planValidation.js.map