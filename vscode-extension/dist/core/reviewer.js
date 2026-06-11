"use strict";
// src/core/reviewer.ts
// Revisor de qualidade automatizado pre-Gate 2: um assistente barato avalia o
// resultado da tarefa contra o criterio de aceite e emite um parecer curto.
// O parecer NAO substitui o humano: ele e apresentado no Gate 2.
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickReviewer = pickReviewer;
exports.buildReviewPrompt = buildReviewPrompt;
exports.parseReviewOutput = parseReviewOutput;
exports.reviewTask = reviewTask;
const chat_1 = require("./chat");
/** Modelos baratos preferidos por engine para o papel de revisor. */
const CHEAP_MODEL_HINTS = ["haiku", "flash", "lite", "mini", "fast", "low"];
function pickCheapModel(cfg) {
    for (const hint of CHEAP_MODEL_HINTS) {
        const m = cfg.models.find((x) => x.toLowerCase().includes(hint));
        if (m)
            return m;
    }
    return cfg.default_model || cfg.models[0] || "";
}
/** Escolhe o engine revisor: o proprio executor da tarefa, com modelo barato. */
function pickReviewer(ef, taskEngine, preferredEngine) {
    const order = [preferredEngine, taskEngine, ...Object.keys(ef.engines)].filter(Boolean);
    for (const id of order) {
        const cfg = ef.engines[id];
        if (cfg && cfg.enabled !== false && cfg.location === "local") {
            return { engineId: id, cfg, model: pickCheapModel(cfg) };
        }
    }
    return null;
}
function buildReviewPrompt(task) {
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
function parseReviewOutput(raw, reviewer) {
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
async function reviewTask(task, ef, cwd, timeoutSec = 120, preferredEngine, runFn = chat_1.runChat) {
    const picked = pickReviewer(ef, task.engine, preferredEngine);
    if (!picked) {
        return { ok: false, reviewer: "(nenhum)", summary: "nenhum assistente local disponivel para revisar" };
    }
    const reviewerLabel = `${picked.engineId}/${picked.model}`;
    try {
        const cfg = { ...picked.cfg, default_model: picked.model };
        const raw = await runFn(cfg, buildReviewPrompt(task), cwd, timeoutSec, "low", () => { });
        return parseReviewOutput(raw, reviewerLabel);
    }
    catch (e) {
        return { ok: false, reviewer: reviewerLabel, summary: `revisao falhou: ${String(e.message || e).slice(0, 200)}` };
    }
}
//# sourceMappingURL=reviewer.js.map