// src/core/reviewer.ts
// Revisor de qualidade automatizado pre-Gate 2: um assistente barato avalia o
// resultado da tarefa contra o criterio de aceite e emite um parecer curto.
// O parecer NAO substitui o humano: ele e apresentado no Gate 2.

import { EnginesFile } from "./config";
import { runChat } from "./chat";
import { EngineConfig, Task } from "./types";

export interface ReviewVerdict {
  ok: boolean;
  reviewer: string;     // engine/modelo usados
  summary: string;      // 1-3 frases para o humano
}

/** Modelos baratos preferidos por engine para o papel de revisor. */
const CHEAP_MODEL_HINTS = ["haiku", "flash", "lite", "mini", "fast", "low"];

function pickCheapModel(cfg: EngineConfig): string {
  for (const hint of CHEAP_MODEL_HINTS) {
    const m = cfg.models.find((x) => x.toLowerCase().includes(hint));
    if (m) return m;
  }
  return cfg.default_model || cfg.models[0] || "";
}

/** Escolhe o engine revisor: o proprio executor da tarefa, com modelo barato. */
export function pickReviewer(ef: EnginesFile, taskEngine: string | undefined, preferredEngine?: string):
  { engineId: string; cfg: EngineConfig; model: string } | null {
  const order = [preferredEngine, taskEngine, ...Object.keys(ef.engines)].filter(Boolean) as string[];
  for (const id of order) {
    const cfg = ef.engines[id];
    if (cfg && cfg.enabled !== false && cfg.location === "local") {
      return { engineId: id, cfg, model: pickCheapModel(cfg) };
    }
  }
  return null;
}

export function buildReviewPrompt(task: Task): string {
  return [
    "Voce e um revisor de qualidade. Avalie se a execucao abaixo atende ao criterio de aceite.",
    "Responda EXATAMENTE neste formato (sem markdown):",
    "VEREDITO: APROVADO ou REPROVADO",
    "RESUMO: ate 3 frases objetivas explicando o porque.",
    "",
    `# Tarefa ${task.id}`,
    task.description,
    "",
    "## Criterio de aceite",
    task.acceptance || "(nao informado)",
    "",
    "## Saida da execucao (final do log)",
    (task.log || "(sem log)").slice(-3000),
  ].join("\n");
}

export function parseReviewOutput(raw: string, reviewer: string): ReviewVerdict {
  const verdictMatch = raw.match(/VEREDITO:\s*(APROVADO|REPROVADO)/i);
  const summaryMatch = raw.match(/RESUMO:\s*([\s\S]{1,600}?)(?:\n\s*\n|$)/i);
  const ok = verdictMatch ? verdictMatch[1].toUpperCase() === "APROVADO" : false;
  const summary = summaryMatch
    ? summaryMatch[1].trim().replace(/\s+/g, " ")
    : raw.trim().slice(0, 300) || "revisor nao retornou parecer";
  return { ok, reviewer, summary };
}

/**
 * Roda a revisao automatizada de uma tarefa. Best-effort: qualquer falha do
 * revisor vira um parecer "nao conclusivo" (ok=false) sem quebrar o fluxo.
 */
export async function reviewTask(
  task: Task,
  ef: EnginesFile,
  cwd: string,
  timeoutSec = 120,
  preferredEngine?: string,
  runFn: typeof runChat = runChat
): Promise<ReviewVerdict> {
  const picked = pickReviewer(ef, task.engine, preferredEngine);
  if (!picked) {
    return { ok: false, reviewer: "(nenhum)", summary: "nenhum assistente local disponivel para revisar" };
  }
  const reviewerLabel = `${picked.engineId}/${picked.model}`;
  try {
    const cfg = { ...picked.cfg, default_model: picked.model };
    const raw = await runFn(cfg, buildReviewPrompt(task), cwd, timeoutSec, "low", () => {});
    return parseReviewOutput(raw, reviewerLabel);
  } catch (e: any) {
    return { ok: false, reviewer: reviewerLabel, summary: `revisao falhou: ${String(e.message || e).slice(0, 200)}` };
  }
}
