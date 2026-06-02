// src/core/commandBuilder.ts
// Monta o comando CLI concreto de uma tarefa a partir do exec_template do engine.

import * as fs from "fs";
import * as path from "path";
import { EngineConfig } from "./types";
import { Task } from "./types";
import { assertValidExecTemplate, ensureInsideDir, redactCommand, sanitizeTemplateValue } from "./commandSecurity";

export interface BuiltCommand {
  command: string;       // comando final para o shell
  redactedCommand: string;
  specFile?: string;     // caminho do arquivo de spec (input_mode=file)
  inputMode: "arg" | "stdin" | "file";
  stdinPayload?: string; // payload quando input_mode=stdin
}

/** Escapa um prompt para uso seguro como argumento de shell. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Constroi o comando para uma tarefa.
 * @param task tarefa ja roteada (engine/model/power definidos)
 * @param cfg config do engine escolhido
 * @param sddPrompt prompt + spec (padrao SDD) ja compilado
 * @param cwd diretorio do projeto-alvo
 * @param specDir onde gravar specs quando input_mode=file
 */
export function buildCommand(
  task: Task,
  cfg: EngineConfig,
  sddPrompt: string,
  cwd: string,
  specDir: string
): BuiltCommand {
  assertValidExecTemplate(cfg, task.engine || "engine");
  let specFile: string | undefined;
  let promptForTemplate = sddPrompt;

  if (cfg.input_mode === "file") {
    fs.mkdirSync(specDir, { recursive: true });
    specFile = ensureInsideDir(path.join(specDir, `${task.id}.spec.md`), specDir);
    fs.writeFileSync(specFile, sddPrompt, "utf8");
    promptForTemplate = ""; // o template usa {spec_file}
  }

  const model = sanitizeTemplateValue(task.model || cfg.default_model, "model");
  const power = sanitizeTemplateValue(task.power || "normal", "power");
  const safeCwd = shellQuote(path.resolve(cwd));
  let command = cfg.exec_template
    .replace("{model}", model)
    .replace("{power}", power)
    .replace("{cwd}", safeCwd)
    .replace("{spec_file}", specFile ? shellQuote(specFile) : "")
    .replace("{prompt}", cfg.input_mode === "arg" ? shellQuote(promptForTemplate) : "");

  // input_mode=stdin: o template nao deve consumir {prompt}; mandamos via stdin
  if (cfg.input_mode === "stdin") {
    command = command.replace("{prompt}", "").trim();
  }

  command = command.trim();
  const promptArg = cfg.input_mode === "arg" ? shellQuote(promptForTemplate) : "";
  const redacted = promptArg ? command.replace(promptArg, "'[REDACTED]'") : command;
  return {
    command,
    redactedCommand: redactCommand(redacted),
    specFile,
    inputMode: cfg.input_mode,
    stdinPayload: cfg.input_mode === "stdin" ? sddPrompt : undefined,
  };
}
