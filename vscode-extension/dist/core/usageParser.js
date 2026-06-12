"use strict";
// src/core/usageParser.ts
// Extrai o consumo REAL de cota do stdout de uma execucao, fechando o ciclo
// estimar -> executar -> MEDIR. Engines podem declarar usage_parse no
// engines.yaml; ha defaults para CLIs conhecidos. Sem medida -> null (a
// estimativa permanece, marcada como nao-medida).
Object.defineProperty(exports, "__esModule", { value: true });
exports.measureUsage = measureUsage;
function jsonPathValue(obj, expr) {
    if (!expr || !expr.startsWith("$."))
        return null;
    let cur = obj;
    for (const k of expr.slice(2).split(".")) {
        if (cur == null)
            return null;
        cur = cur[k];
    }
    return cur;
}
function parsePositiveNumber(value) {
    if (typeof value === "number")
        return Number.isFinite(value) && value > 0 ? value : null;
    if (typeof value !== "string")
        return null;
    const normalized = value.trim().replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
/** Procura o ultimo objeto JSON parseavel no stdout (CLIs imprimem o resultado ao final). */
function lastJsonObject(stdout) {
    const trimmed = stdout.trim();
    // caso comum: stdout inteiro e um JSON
    try {
        return JSON.parse(trimmed);
    }
    catch { /* segue */ }
    // fallback: ultima linha que parece JSON
    const lines = trimmed.split("\n").reverse();
    for (const line of lines) {
        const l = line.trim();
        if (l.startsWith("{") && l.endsWith("}")) {
            try {
                return JSON.parse(l);
            }
            catch { /* segue */ }
        }
    }
    return null;
}
/**
 * Defaults por formato conhecido:
 * - claude -p --output-format json => {"usage":{"input_tokens":N,"output_tokens":N},...}
 * - codex exec => linha "tokens used: 12.345" (ou "tokens used: 12345")
 */
function parseWithDefaults(stdout, unit) {
    const obj = lastJsonObject(stdout);
    if (obj && typeof obj === "object") {
        const usage = obj.usage || obj.result?.usage;
        if (usage) {
            const total = (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0) +
                (Number(usage.cache_creation_input_tokens) || 0) + (Number(usage.cache_read_input_tokens) || 0);
            if (total > 0)
                return total;
        }
        if (typeof obj.total_tokens === "number" && obj.total_tokens > 0)
            return obj.total_tokens;
    }
    const m = stdout.match(/tokens used:?\s*([\d.,]+)/i);
    if (m) {
        const n = Number(m[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
        if (Number.isFinite(n) && n > 0)
            return n;
    }
    if (unit === "acu") {
        const a = stdout.match(/([\d.]+)\s*ACUs?\b/i);
        if (a) {
            const n = Number(a[1]);
            if (Number.isFinite(n) && n > 0)
                return n;
        }
    }
    return null;
}
/**
 * Mede o consumo real de uma execucao a partir do stdout.
 * Ordem: usage_parse declarado no engine > defaults conhecidos > null.
 */
function measureUsage(cfg, stdout) {
    if (!stdout || !stdout.trim())
        return null;
    const unit = cfg?.unit || "token";
    const up = cfg?.usage_parse;
    if (up) {
        if (up.parse === "json" && up.json_path) {
            const obj = lastJsonObject(stdout);
            const v = obj ? jsonPathValue(obj, up.json_path) : null;
            const n = parsePositiveNumber(v);
            if (n != null)
                return { unit, amount: n };
        }
        else if (up.parse === "regex" && up.pattern) {
            try {
                const m = stdout.match(new RegExp(up.pattern, "i"));
                if (m && m[1]) {
                    const n = parsePositiveNumber(m[1]);
                    if (n != null)
                        return { unit, amount: n };
                }
            }
            catch { /* pattern invalido: cai nos defaults */ }
        }
    }
    const fallback = parseWithDefaults(stdout, unit);
    return fallback != null ? { unit, amount: fallback } : null;
}
//# sourceMappingURL=usageParser.js.map