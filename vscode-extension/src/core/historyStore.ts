// src/core/historyStore.ts
// Historico append-only de execucoes (state/history.json) e telemetria de
// roteamento. Alimenta o dashboard de cota e a recalibracao de task_size_*.

import * as fs from "fs";
import * as path from "path";
import { ExecutionRecord, RoutingOverrideRecord } from "./types";

interface HistoryShape {
  version: number;
  executions: ExecutionRecord[];
  routingOverrides: RoutingOverrideRecord[];
}

const EMPTY: HistoryShape = { version: 1, executions: [], routingOverrides: [] };
const MAX_RECORDS = 2000; // protecao contra crescimento sem limite

export class HistoryStore {
  constructor(private readonly file: string) {}

  load(): HistoryShape {
    if (!fs.existsSync(this.file)) return { ...EMPTY, executions: [], routingOverrides: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return {
        version: raw.version || 1,
        executions: Array.isArray(raw.executions) ? raw.executions : [],
        routingOverrides: Array.isArray(raw.routingOverrides) ? raw.routingOverrides : [],
      };
    } catch {
      return { ...EMPTY, executions: [], routingOverrides: [] };
    }
  }

  private save(shape: HistoryShape) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(shape, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }

  appendExecution(rec: ExecutionRecord) {
    const shape = this.load();
    shape.executions.push(rec);
    if (shape.executions.length > MAX_RECORDS) {
      shape.executions = shape.executions.slice(-MAX_RECORDS);
    }
    this.save(shape);
  }

  appendRoutingOverride(rec: RoutingOverrideRecord) {
    const shape = this.load();
    shape.routingOverrides.push(rec);
    if (shape.routingOverrides.length > MAX_RECORDS) {
      shape.routingOverrides = shape.routingOverrides.slice(-MAX_RECORDS);
    }
    this.save(shape);
  }
}

export interface SizeCalibration {
  size: string;
  unit: string;
  samples: number;
  declaredEstimate: number | null;  // media das estimativas registradas
  measuredMedian: number | null;    // mediana do consumo real medido
  ratio: number | null;             // mediana medida / estimativa media
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Compara estimativas com medidas reais por classe de tamanho.
 * Base para recalibrar task_size_tokens/acu com dados do proprio uso.
 */
export function calibrationBySize(executions: ExecutionRecord[]): SizeCalibration[] {
  const groups = new Map<string, ExecutionRecord[]>();
  for (const e of executions) {
    if (!e.measured || e.realQuota == null) continue;
    const key = `${e.size}|${e.unit}`;
    const arr = groups.get(key) || [];
    arr.push(e);
    groups.set(key, arr);
  }
  return [...groups.entries()].map(([key, recs]) => {
    const [size, unit] = key.split("|");
    const est = recs.map((r) => r.estimatedQuota).filter((n) => n > 0);
    const real = recs.map((r) => r.realQuota!).filter((n) => n > 0);
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

export interface EngineConsumption {
  engine: string;
  unit: string;
  tasks: number;
  measuredTasks: number;
  totalEstimated: number;
  totalReal: number;     // medido quando ha, senao estimado (claramente separados)
  totalMeasured: number; // apenas o que foi de fato medido
}

/** Consumo agregado por assistente (para o dashboard). */
export function consumptionByEngine(executions: ExecutionRecord[]): EngineConsumption[] {
  const map = new Map<string, EngineConsumption>();
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
    } else {
      cur.totalReal += e.estimatedQuota || 0;
    }
    map.set(e.engine, cur);
  }
  return [...map.values()].sort((a, b) => b.totalReal - a.totalReal);
}
