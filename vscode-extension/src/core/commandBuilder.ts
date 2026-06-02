// src/core/commandBuilder.ts
// Monta o comando CLI concreto de uma tarefa a partir do exec_template do engine.

import * as fs from "fs";
import * as path from "path";
import { EngineConfig } from "./types";
import { Task } from "./types";

export interface BuiltCommand {
  command: string;       // comando final para o shell
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
  let specFile: string | undefined;
  let promptForTemplate = sddPrompt;

  if (cfg.input_mode === "file") {
    fs.mkdirSync(specDir, { recursive: true });
    specFile = path.join(specDir, `${task.id}.spec.md`);
    fs.writeFileSync(specFile, sddPrompt, "utf8");
    promptForTemplate = ""; // o template usa {spec_file}
  }

  let command = cfg.exec_template
    .replace("{model}", task.model || cfg.default_model)
    .replace("{power}", task.power || "normal")
    .replace("{cwd}", cwd)
    .replace("{spec_file}", specFile ? shellQuote(specFile) : "")
    .replace("{prompt}", cfg.input_mode === "arg" ? shellQuote(promptForTemplate) : "");

  // input_mode=stdin: o template nao deve consumir {prompt}; mandamos via stdin
  if (cfg.input_mode === "stdin") {
    command = command.replace("{prompt}", "").trim();
  }

  return {
    command: command.trim(),
    specFile,
    inputMode: cfg.input_mode,
    stdinPayload: cfg.input_mode === "stdin" ? sddPrompt : undefined,
  };
}
