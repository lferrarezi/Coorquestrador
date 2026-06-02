"use strict";
// src/ui/gates.ts
// Gates HITL via dialogos modais do VSCode.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.gate1PlanCost = gate1PlanCost;
exports.gate2Delivery = gate2Delivery;
const vscode = __importStar(require("vscode"));
function fmtQuota(amount, unit) {
    if (unit === "acu")
        return `${Math.round(amount * 10) / 10} ACU`;
    return `${Math.round(amount).toLocaleString("pt-BR")} tokens`;
}
/** Gate 1: aprova plano + consumo de cota antes de qualquer execucao. Obrigatorio na v1. */
async function gate1PlanCost(demand) {
    const lines = demand.tasks.map((t) => `${t.id} [${t.status}] ${t.engine ?? "SEM-ENGINE"} ${t.model ?? ""} ${t.power ?? ""} ~${fmtQuota(t.estimatedQuota || 0, t.quotaUnit)}`);
    const blocked = demand.tasks.filter((t) => t.status === "bloqueada");
    const quota = Object.entries(demand.estimatedQuotaByEngine || {})
        .map(([engine, q]) => `${engine}: ${fmtQuota(q.amount, q.unit)}`)
        .join("\n");
    const detail = `Consumo de cota estimado:\n${quota || "n/d"}\n\n` +
        lines.join("\n") +
        (blocked.length ? `\n\n${blocked.length} tarefa(s) bloqueada(s) por falta de engine.` : "");
    const choice = await vscode.window.showWarningMessage(`Gate 1 — Aprovar plano e cota de "${demand.title}"?`, { modal: true, detail }, "Aprovar e executar", "Replanejar");
    return choice === "Aprovar e executar";
}
/** Gate 2: aprova entrega quando ha impacto (cota, prod, dados, commit). */
async function gate2Delivery(task, reasons) {
    const choice = await vscode.window.showWarningMessage(`Gate 2 — Aprovar entrega da tarefa ${task.id}?`, { modal: true, detail: `Motivos do gate: ${reasons.join(", ")}\n\nCota real: ${fmtQuota(task.realQuota || 0, task.quotaUnit)}` }, "Aprovar entrega", "Rejeitar (retrabalho)");
    return choice === "Aprovar entrega";
}
//# sourceMappingURL=gates.js.map