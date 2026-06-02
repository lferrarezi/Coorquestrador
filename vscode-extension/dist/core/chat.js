"use strict";
// src/core/chat.ts
// Conversa livre com um engine via CLI. Reusa exec_template/input_mode do engine
// e faz streaming do stdout de volta ao painel (onChunk).
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildChatPrompt = buildChatPrompt;
exports.runChat = runChat;
const child_process_1 = require("child_process");
/** Monta o prompt do turno atual incluindo o historico (CLI e stateless). */
function buildChatPrompt(system, history) {
    const convo = history
        .map((t) => (t.role === "user" ? `Usuario: ${t.content}` : `Assistente: ${t.content}`))
        .join("\n\n");
    return [system, "\n\n---\n\n# CONVERSA\n", convo, "\n\nAssistente:"].join("\n");
}
/** Invoca o engine de chat e faz streaming do stdout. Resolve com o texto completo. */
function runChat(engineCfg, prompt, cwd, timeoutSec, power, onChunk) {
    return new Promise((resolve, reject) => {
        let command = engineCfg.exec_template
            .replace("{model}", engineCfg.default_model)
            .replace("{power}", power)
            .replace("{spec_file}", "")
            .replace("{prompt}", engineCfg.input_mode === "arg" ? JSON.stringify(prompt) : "");
        command = command.replace("{prompt}", "").trim();
        const child = (0, child_process_1.spawn)(command, { cwd, shell: true });
        let out = "";
        let err = "";
        const timer = setTimeout(() => child.kill("SIGTERM"), timeoutSec * 1000);
        child.stdout.on("data", (d) => {
            const s = d.toString();
            out += s;
            onChunk(s);
        });
        child.stderr.on("data", (d) => (err += d.toString()));
        if (engineCfg.input_mode === "stdin") {
            child.stdin.write(prompt);
            child.stdin.end();
        }
        else {
            // fecha o stdin para CLIs que aguardam EOF quando detectam pipe (ex.: codex exec)
            child.stdin.end();
        }
        child.on("error", (e) => { clearTimeout(timer); reject(e); });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0 || out.length > 0)
                resolve(out);
            else
                reject(new Error(`Chat falhou (exit ${code}): ${err.slice(0, 300)}`));
        });
    });
}
//# sourceMappingURL=chat.js.map