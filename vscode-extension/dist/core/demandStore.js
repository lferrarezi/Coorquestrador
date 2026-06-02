"use strict";
// src/core/demandStore.ts
// Persiste e atualiza a lista de demandas multiprojeto (state/demands.json).
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
exports.DemandStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class DemandStore {
    constructor(file) {
        this.file = file;
    }
    load() {
        if (!fs.existsSync(this.file))
            return { version: 1, demands: [] };
        return JSON.parse(fs.readFileSync(this.file, "utf8"));
    }
    save(shape) {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(shape, null, 2), "utf8");
        fs.renameSync(tmp, this.file);
    }
    upsert(demand) {
        const shape = this.load();
        const i = shape.demands.findIndex((d) => d.id === demand.id);
        if (i >= 0)
            shape.demands[i] = demand;
        else
            shape.demands.push(demand);
        this.save(shape);
    }
    get(id) {
        return this.load().demands.find((d) => d.id === id);
    }
    list(project) {
        const all = this.load().demands;
        return project ? all.filter((d) => d.project === project) : all;
    }
    /** Recalcula totais reais a partir das tarefas e grava. */
    reconcile(id) {
        const shape = this.load();
        const d = shape.demands.find((x) => x.id === id);
        if (!d)
            return;
        d.estimatedTotal = d.tasks.reduce((s, t) => s + (t.estimatedCost || 0), 0);
        d.realTotal = d.tasks.reduce((s, t) => s + (t.realCost || 0), 0);
        d.estimatedQuotaByEngine = {};
        d.realQuotaByEngine = {};
        for (const t of d.tasks) {
            if (t.engine && t.quotaUnit && t.estimatedQuota != null) {
                const cur = d.estimatedQuotaByEngine[t.engine] || { unit: t.quotaUnit, amount: 0 };
                cur.amount += t.estimatedQuota;
                d.estimatedQuotaByEngine[t.engine] = cur;
            }
            if (t.engine && t.quotaUnit && t.realQuota != null) {
                const cur = d.realQuotaByEngine[t.engine] || { unit: t.quotaUnit, amount: 0 };
                cur.amount += t.realQuota;
                d.realQuotaByEngine[t.engine] = cur;
            }
        }
        const allDone = d.tasks.every((t) => t.status === "concluida");
        const anyBlocked = d.tasks.some((t) => t.status === "bloqueada");
        d.status = allDone ? "concluida" : anyBlocked ? "bloqueada" : d.status;
        this.save(shape);
    }
}
exports.DemandStore = DemandStore;
//# sourceMappingURL=demandStore.js.map