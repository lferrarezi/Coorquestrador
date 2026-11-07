// src/core/chat.ts
// Conversa livre com um engine via CLI. Reusa exec_template/input_mode do engine
// e faz streaming do stdout de volta ao painel (onChunk).

import { spawn } from "child_process";
import { EngineConfig } from "./types";
import { assertReadOnlyChatTemplate, assertValidExecTemplate, sanitizeTemplateValue } from "./commandSecurity";

/** Escapa para uso seguro como argumento unico de shell (aspas simples). */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export interface ChatTurn { role: "user" | "assistant"; content: string; }

/** O chat e uma etapa de descoberta; alteracoes pertencem ao plano aprovado. */
export const CHAT_READ_ONLY_SYSTEM = `
MODO CONVERSA SOMENTE LEITURA:
- Nao crie, edite, remova ou sobrescreva arquivos.
- Nao execute comandos com efeitos colaterais, nao instale dependencias e nao altere configuracoes.
- Pode inspecionar o workspace para responder e refinar a demanda.
- Se o usuario pedir uma mudanca, descreva o que seria feito e aguarde a conversao em tarefa e a aprovacao do Gate 1.
- Nunca afirme que uma mudanca foi executada durante esta conversa.
`;

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
    // Nao reutiliza exec_template: um engine customizado sem uma variante
    // somente leitura deve falhar fechado, antes de qualquer spawn.
    const template = engineCfg.chat_exec_template;
    if (!template) {
      reject(new Error("Engine sem chat_exec_template somente leitura; conversa bloqueada por seguranca."));
      return;
    }
    const chatCfg = { ...engineCfg, exec_template: template };
    assertReadOnlyChatTemplate(chatCfg, "chat");
    assertValidExecTemplate(chatCfg, "chat");
    if (engineCfg.input_mode === "file") {
      reject(new Error("Chat somente leitura nao suporta input_mode=file sem arquivo de prompt; conversa bloqueada."));
      return;
    }
    let command = template
      .replace("{model}", sanitizeTemplateValue(engineCfg.default_model, "model"))
      .replace("{power}", sanitizeTemplateValue(power, "power"))
      .replace("{cwd}", shellQuote(cwd))
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
