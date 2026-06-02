// src/core/commandSecurity.ts
// Validacao e redacao para comandos shell configurados por engine.

import * as path from "path";
import { EngineConfig } from "./types";

const ALLOWED_PLACEHOLDERS = new Set(["model", "power", "prompt", "spec_file", "cwd"]);
const SAFE_ARG = /^[a-zA-Z0-9._:@/+,-]+$/;
const SECRET_PATTERNS: RegExp[] = [
  /(sk-[a-zA-Z0-9_-]{12,})/g,
  /(sb_[a-zA-Z0-9_-]{12,})/g,
  /([A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD)[A-Z0-9_]*=)([^\s'"]+)/gi,
  /(Bearer\s+)([a-zA-Z0-9._-]+)/gi,
];

export function validateExecTemplate(cfg: EngineConfig, engineId = "engine"): string[] {
  const errors: string[] = [];
  if (!cfg.exec_template || !cfg.exec_template.trim()) errors.push(`${engineId}: exec_template vazio.`);
  if (!["arg", "stdin", "file"].includes(cfg.input_mode)) errors.push(`${engineId}: input_mode invalido.`);

  const placeholders = [...(cfg.exec_template || "").matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  for (const p of placeholders) {
    if (!ALLOWED_PLACEHOLDERS.has(p)) errors.push(`${engineId}: placeholder desconhecido {${p}}.`);
  }
  if (cfg.input_mode === "arg" && !placeholders.includes("prompt")) {
    errors.push(`${engineId}: input_mode=arg exige {prompt} no exec_template.`);
  }
  if (cfg.input_mode === "file" && !placeholders.includes("spec_file")) {
    errors.push(`${engineId}: input_mode=file exige {spec_file} no exec_template.`);
  }
  return errors;
}

export function assertValidExecTemplate(cfg: EngineConfig, engineId = "engine") {
  const errors = validateExecTemplate(cfg, engineId);
  if (errors.length) throw new Error(errors.join(" "));
}

export function sanitizeTemplateValue(value: string, field: string): string {
  if (!value || !SAFE_ARG.test(value)) {
    throw new Error(`${field} contem caracteres nao permitidos para comando shell.`);
  }
  return value;
}

export function ensureInsideDir(file: string, dir: string): string {
  const absFile = path.resolve(file);
  const absDir = path.resolve(dir);
  const rel = path.relative(absDir, absFile);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Caminho fora do diretorio permitido: ${file}`);
  }
  return absFile;
}

export function redactSecrets(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (...args) => {
      if (args.length >= 4 && typeof args[1] === "string" && typeof args[2] === "string") {
        return `${args[1]}[REDACTED]`;
      }
      return "[REDACTED]";
    });
  }
  return out;
}

export function redactCommand(command: string): string {
  let out = redactSecrets(command);
  out = out.replace(/(--(?:prompt|task)\s+)'[^']*'/gi, "$1'[REDACTED]'");
  return out.length > 800 ? `${out.slice(0, 800)}...` : out;
}
