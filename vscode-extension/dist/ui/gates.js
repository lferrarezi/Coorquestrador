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
function fmt(n) {
    return n.toFixed(2);
}
/** Gate 1: aprova plano + custo antes de qualquer execucao. Obrigatorio na v1. */
async function gate1PlanCost(demand) {
    const lines = demand.tasks.map((t) => `${t.id} [${t.status}] ${t.engine ?? "SEM-ENGINE"} ${t.model ?? ""} ${t.power ?? ""} ~$${fmt(t.estimatedCost || 0)}`);
    const blocked = demand.tasks.filter((t) => t.status === "bloqueada");
    const detail = lines.join("\n") +
        `\n\nTotal estimado: $${fmt(demand.estimatedTotal || 0)}` +
        (blocked.length ? `\n\n${blocked.length} tarefa(s) bloqueada(s) por falta de engine.` : "");
    const choice = await vscode.window.showWarningMessage(`Gate 1 — Aprovar plano e custo de "${demand.title}"?`, { modal: true, detail }, "Aprovar e executar", "Replanejar");
    return choice === "Aprovar e executar";
}
/** Gate 2: aprova entrega quando ha impacto (custo, prod, dados, commit). */
async function gate2Delivery(task, reasons) {
    const choice = await vscode.window.showWarningMessage(`Gate 2 — Aprovar entrega da tarefa ${task.id}?`, { modal: true, detail: `Motivos do gate: ${reasons.join(", ")}\n\nCusto real: $${(task.realCost || 0).toFixed(2)}` }, "Aprovar entrega", "Rejeitar (retrabalho)");
    return choice === "Aprovar entrega";
}
//# sourceMappingURL=gates.js.map