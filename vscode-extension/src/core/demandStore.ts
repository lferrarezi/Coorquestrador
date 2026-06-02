// src/core/demandStore.ts
// Persiste e atualiza a lista de demandas multiprojeto (state/demands.json).

import * as fs from "fs";
import * as path from "path";
import { Demand, DemandStoreShape } from "./types";

export class DemandStore {
  constructor(private readonly file: string) {}

  load(): DemandStoreShape {
    if (!fs.existsSync(this.file)) return { version: 1, demands: [] };
    return JSON.parse(fs.readFileSync(this.file, "utf8"));
  }

  save(shape: DemandStoreShape) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(shape, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }

  upsert(demand: Demand) {
    const shape = this.load();
    const i = shape.demands.findIndex((d) => d.id === demand.id);
    if (i >= 0) shape.demands[i] = demand;
    else shape.demands.push(demand);
    this.save(shape);
  }

  get(id: string): Demand | undefined {
    return this.load().demands.find((d) => d.id === id);
  }

  list(project?: string): Demand[] {
    const all = this.load().demands;
    return project ? all.filter((d) => d.project === project) : all;
  }

  /** Recalcula totais reais a partir das tarefas e grava. */
  reconcile(id: string) {
    const shape = this.load();
    const d = shape.demands.find((x) => x.id === id);
    if (!d) return;
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
