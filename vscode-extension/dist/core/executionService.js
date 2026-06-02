"use strict";
// src/core/executionService.ts
// Servico compartilhado para executar demandas, persistir logs e finalizar Gate 2.
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
exports.runDemandExecution = runDemandExecution;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const commandBuilder_1 = require("./commandBuilder");
const commandSecurity_1 = require("./commandSecurity");
const executor_1 = require("./executor");
const estimator_1 = require("./estimator");
function sddForTask(t) {
    return `# Tarefa ${t.id}\n${t.description}\n\n## Criterio de aceite\n${t.acceptance}`;
}
function gate2Reasons(t, cost) {
    const reasons = [];
    if ((0, estimator_1.crossesQuotaGate2)(t, cost) || (0, estimator_1.crossesGate2)(t.estimatedCost || 0, cost)) {
        reasons.push("consumo de cota acima do teto");
    }
    if ((t.log || "").toLowerCase().includes("error")) {
        reasons.push("log de execucao contem erro");
    }
    return reasons;
}
function persistTaskLog(logDir, task, result) {
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, `${task.id}.log`);
    const body = [
        `task: ${task.id}`,
        `engine: ${task.engine || ""}`,
        `model: ${task.model || ""}`,
        `power: ${task.power || ""}`,
        `exit_code: ${result.code}`,
        `duration_ms: ${result.durationMs}`,
        `command: ${(0, commandSecurity_1.redactCommand)(task.redactedCommand || task.command || "")}`,
        "",
        "----- stdout -----",
        (0, commandSecurity_1.redactSecrets)(result.stdout),
        "",
        "----- stderr -----",
        (0, commandSecurity_1.redactSecrets)(result.stderr),
    ].join("\n");
    fs.writeFileSync(file, body, "utf8");
    task.logFile = file;
    task.durationMs = result.durationMs;
}
async function runDemandExecution(opts) {
    const demand = opts.demand;
    demand.tasks.forEach((t) => { if (t.status === "planejada")
        t.status = "aprovada"; });
    demand.status = "em-execucao";
    opts.store.upsert(demand);
    const cwd = path.join(opts.root, demand.project);
    const specDir = path.join(opts.root, opts.configDir, "specs", demand.id);
    const logDir = path.join(opts.root, opts.configDir, "logs", demand.id);
    const results = await (0, executor_1.executePlan)({
        tasks: demand.tasks,
        cwd,
        maxParallel: Math.min(opts.maxParallel, opts.enginesFile.defaults.max_parallel),
        execTimeoutSec: opts.enginesFile.defaults.exec_timeout_seconds,
        gate1Approved: opts.gate1Approved,
        buildFn: (t) => (0, commandBuilder_1.buildCommand)(t, opts.enginesFile.engines[t.engine], sddForTask(t), cwd, specDir),
        onUpdate: (t) => {
            opts.store.upsert(demand);
            opts.onUpdate({ task: t, demand });
        },
    });
    for (const result of results) {
        const task = demand.tasks.find((t) => t.id === result.taskId);
        if (task)
            persistTaskLog(logDir, task, result);
    }
    for (const task of demand.tasks.filter((t) => t.status === "revisao")) {
        const reasons = gate2Reasons(task, opts.costTable);
        let approved = true;
        if (reasons.length && opts.reviewGate2) {
            approved = await opts.reviewGate2({ task, reasons });
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
//# sourceMappingURL=executionService.js.map