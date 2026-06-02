// src/core/chat.ts
// Conversa livre com um engine via CLI. Reusa exec_template/input_mode do engine
// e faz streaming do stdout de volta ao painel (onChunk).

import { spawn } from "child_process";
import { EngineConfig } from "./types";

/** Escapa para uso seguro como argumento unico de shell (aspas simples). */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export interface ChatTurn { role: "user" | "assistant"; content: string; }

/** Monta o prompt do turno atual incluindo o historico (CLI e stateless). */
export function buildChatPrompt(system: string, history: ChatTurn[]): string {
  const convo = history
    .map((t) => (t.role === "user" ? `Usuario: ${t.content}` : `Assistente: ${t.content}`))
    .join("\n\n");
  return [system, "\n\n---\n\n# CONVERSA\n", convo, "\n\nAssistente:"].join("\n");
}

/** Invoca o engine de chat e faz streaming do stdout. Resolve com o texto completo. */
export function runChat(
  engineCfg: EngineConfig,
  prompt: string,
  cwd: string,
  timeoutSec: number,
  power: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    let command = engineCfg.exec_template
      .replace("{model}", engineCfg.default_model)
      .replace("{power}", power)
      .replace("{spec_file}", "")
      .replace("{prompt}", engineCfg.input_mode === "arg" ? shellQuote("\n" + prompt) : "");
    command = command.replace("{prompt}", "").trim();

    const child = spawn(command, { cwd, shell: true });
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
    } else {
      // fecha o stdin para CLIs que aguardam EOF quando detectam pipe (ex.: codex exec)
      child.stdin.end();
    }
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || out.length > 0) resolve(out);
      else reject(new Error(`Chat falhou (exit ${code}): ${err.slice(0, 300)}`));
    });
  });
}
