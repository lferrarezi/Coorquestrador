"use strict";
// src/core/historyStore.ts
// Historico append-only de execucoes (state/history.json) e telemetria de
// roteamento. Alimenta o dashboard de cota e a recalibracao de task_size_*.
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
exports.HistoryStore = void 0;
exports.calibrationBySize = calibrationBySize;
exports.consumptionByEngine = consumptionByEngine;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const EMPTY = { version: 1, executions: [], routingOverrides: [] };
const MAX_RECORDS = 2000; // protecao contra crescimento sem limite
class HistoryStore {
    constructor(file) {
        this.file = file;
    }
    load() {
        if (!fs.existsSync(this.file))
            return { ...EMPTY, executions: [], routingOverrides: [] };
        try {
            const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
            return {
                version: raw.version || 1,
                executions: Array.isArray(raw.executions) ? raw.executions : [],
                routingOverrides: Array.isArray(raw.routingOverrides) ? raw.routingOverrides : [],
            };
        }
        catch {
            return { ...EMPTY, executions: [], routingOverrides: [] };
        }
    }
    save(shape) {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = this.file + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(shape, null, 2), "utf8");
        fs.renameSync(tmp, this.file);
    }
    appendExecution(rec) {
        const shape = this.load();
        shape.executions.push(rec);
        if (shape.executions.length > MAX_RECORDS) {
            shape.executions = shape.executions.slice(-MAX_RECORDS);
        }
        this.save(shape);
    }
    appendRoutingOverride(rec) {
        const shape = this.load();
        shape.routingOverrides.push(rec);
        if (shape.routingOverrides.length > MAX_RECORDS) {
            shape.routingOverrides = shape.routingOverrides.slice(-MAX_RECORDS);
        }
        this.save(shape);
    }
}
exports.HistoryStore = HistoryStore;
function median(values) {
    if (!values.length)
        return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/**
 * Compara estimativas com medidas reais por classe de tamanho.
 * Base para recalibrar task_size_tokens/acu com dados do proprio uso.
 */
function calibrationBySize(executions) {
    const groups = new Map();
    for (const e of executions) {
        if (!e.measured || e.realQuota == null)
            continue;
        const key = `${e.size}|${e.unit}`;
        const arr = groups.get(key) || [];
        arr.push(e);
        groups.set(key, arr);
    }
    return [...groups.entries()].map(([key, recs]) => {
        const [size, unit] = key.split("|");
        const est = recs.map((r) => r.estimatedQuota).filter((n) => n > 0);
        const real = recs.map((r) => r.realQuota).filter((n) => n > 0);
        const declaredEstimate = est.length ? est.reduce((a, b) => a + b, 0) / est.length : null;
        const measuredMedian = median(real);
        return {
            size, unit,
            samples: recs.length,
            declaredEstimate,
            measuredMedian,
            ratio: declaredEstimate && measuredMedian ? measuredMedian / declaredEstimate : null,
        };
    }).sort((a, b) => a.size.localeCompare(b.size));
}
/** Consumo agregado por assistente (para o dashboard). */
function consumptionByEngine(executions) {
    const map = new Map();
    for (const e of executions) {
        const cur = map.get(e.engine) || {
            engine: e.engine, unit: e.unit, tasks: 0, measuredTasks: 0,
            totalEstimated: 0, totalReal: 0, totalMeasured: 0,
        };
        cur.tasks += 1;
        cur.totalEstimated += e.estimatedQuota || 0;
        if (e.measured && e.realQuota != null) {
            cur.measuredTasks += 1;
            cur.totalMeasured += e.realQuota;
            cur.totalReal += e.realQuota;
        }
        else {
            cur.totalReal += e.estimatedQuota || 0;
        }
        map.set(e.engine, cur);
    }
    return [...map.values()].sort((a, b) => b.totalReal - a.totalReal);
}
//# sourceMappingURL=historyStore.js.map