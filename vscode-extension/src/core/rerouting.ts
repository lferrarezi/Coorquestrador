// src/core/rerouting.ts
// Re-roteamento deterministico por cota, aplicado APOS o plano do agente e
// ANTES do Gate 1: se o assistente roteado esta sem cota suficiente, a tarefa
// e re-roteada para o melhor elegivel disponivel, com aviso no card.

import { EnginesFile } from "./config";
import { eligible } from "./prober";
import { EngineSnapshot, Task } from "./types";

export interface RerouteResult {
  task: Task;
  from: string;
  to: string;
  reason: string;
}

function pickModelFor(engineId: string, ef: EnginesFile, preferred?: string): string {
  const cfg = ef.engines[engineId];
  if (!cfg) return preferred || "";
  if (preferred && cfg.models.includes(preferred)) return preferred;
  return cfg.default_model || cfg.models[0] || "";
}

function pickPowerFor(engineId: string, model: string, ef: EnginesFile, preferred?: string): string {
  const cfg = ef.engines[engineId];
  const modelPowers = cfg?.model_powers?.[model];
  const powers = modelPowers?.length ? modelPowers : cfg?.powers?.length ? cfg.powers : ["normal"];
  if (preferred && powers.includes(preferred)) return preferred;
  return powers.includes("normal") ? "normal" : powers[0];
}

/** Pontua um candidato pela adequacao (best_for vs activity) e cota restante. */
function scoreCandidate(engineId: string, task: Task, ef: EnginesFile, snap: EngineSnapshot): number {
  const cfg = ef.engines[engineId];
  let score = 0;
  const activity = `${task.activity} ${task.description}`.toLowerCase();
  for (const tag of cfg?.best_for || []) {
    if (activity.includes(tag.toLowerCase().replace(/-/g, " ")) || activity.includes(tag.toLowerCase())) score += 2;
  }
  if (snap.creditRemaining != null) score += Math.min(snap.creditRemaining, 100) / 100;
  else score += 0.5; // cota desconhecida vale menos que cota alta conhecida
  return score;
}

/**
 * Aplica o re-roteamento por cota num plano roteado.
 * Mutates as tasks (engine/model/power + flag rerouted) e devolve o que mudou.
 */
export function rerouteForQuota(
  tasks: Task[],
  ef: EnginesFile,
  snapshots: EngineSnapshot[],
  minThreshold = ef.defaults.min_credit_threshold
): RerouteResult[] {
  const okSnaps = eligible(snapshots, minThreshold);
  const okIds = new Set(okSnaps.map((s) => s.id));
  const snapById = new Map(snapshots.map((s) => [s.id, s]));
  const changes: RerouteResult[] = [];

  for (const t of tasks) {
    if (!t.engine) continue;
    if (okIds.has(t.engine)) continue; // roteamento original esta saudavel

    const snap = snapById.get(t.engine);
    const reason = !snap
      ? "assistente nao detectado"
      : snap.state !== "disponivel"
        ? `assistente ${snap.state}`
        : `cota insuficiente (${snap.creditRemaining ?? "n/d"}% <= ${minThreshold}%)`;

    // melhor candidato elegivel por adequacao + cota
    const candidates = okSnaps
      .filter((s) => s.id !== t.engine)
      .sort((a, b) => scoreCandidate(b.id, t, ef, b) - scoreCandidate(a.id, t, ef, a));

    const best = candidates[0];
    if (!best) {
      // ninguem elegivel: bloqueia em vez de queimar cota de um engine esgotado
      t.status = "bloqueada";
      t.log = ((t.log || "") + `\n[coorq] bloqueada pre-execucao: ${reason} e nenhum assistente elegivel`).trim();
      t.engine = undefined;
      t.model = undefined;
      t.power = undefined;
      t.rerouted = undefined;
      continue;
    }

    const from = t.engine;
    t.rerouted = { from, reason };
    t.engine = best.id;
    t.model = pickModelFor(best.id, ef, t.model);
    t.power = pickPowerFor(best.id, t.model, ef, t.power);
    changes.push({ task: t, from, to: best.id, reason });
  }

  return changes;
}
