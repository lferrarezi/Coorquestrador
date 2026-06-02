// src/core/planner.ts
// O raciocinio de planejamento roda como um agente .agent.md, invocado via CLI.
// Aqui montamos o prompt do agente (demanda + contexto + snapshot de engines)
// e parseamos o plano estruturado que ele devolve.

import * as fs from "fs";
import { spawn } from "child_process";
import { EngineConfig, EngineSnapshot, Task, Demand } from "./types";

/** Escapa para uso seguro como argumento unico de shell (aspas simples). */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export interface PlanResult {
  tasks: Task[];
  routingNotes: string;
  raw: string;
}

/** Monta o prompt enviado ao agente coorquestrador. */
export function buildPlannerPrompt(opts: {
  agentSpec: string;        // conteudo de coorquestrador.agent.md (pacote ativo)
  skills?: string;          // SKILL.md concatenadas do pacote ativo
  demand: Demand;
  projectContext: string;   // AGENTS.md/constitution/docs resumidos
  snapshot: EngineSnapshot[];
  enginesMeta: Record<string, Pick<EngineConfig, "models" | "powers" | "best_for" | "unit" | "location">>;
}): string {
  return [
    opts.agentSpec,
    opts.skills ? "\n\n---\n\n# SKILLS DO NUCLEO ATIVO\n" + opts.skills : "",
    "\n\n---\n\n# DEMANDA ATUAL\n",
    `Projeto: ${opts.demand.project}`,
    `Titulo: ${opts.demand.title}`,
    `Descricao:\n${opts.demand.description}`,
    "\n# CONTEXTO DO PROJETO\n",
    opts.projectContext || "(sem contexto adicional)",
    "\n# SNAPSHOT DE ENGINES (probe)\n",
    "```json",
    JSON.stringify(opts.snapshot, null, 2),
    "```",
    "\n# CAPACIDADES DECLARADAS\n",
    "```json",
    JSON.stringify(opts.enginesMeta, null, 2),
    "```",
    "\n# INSTRUCAO DE SAIDA\n",
    "Produza o plano. Ao final, inclua um bloco ```json com o array de tarefas no schema:",
    "[{id, activity, description, size, criticality, dependsOn, acceptance, engine, model, power}]",
    "Use SOMENTE engines com state=disponivel e credito suficiente. Tarefas sem engine viavel: engine=null.",
  ].join("\n");
}

/** Extrai o array de tarefas do bloco ```json no fim da resposta do agente. */
export function parsePlan(raw: string): Task[] {
  const matches = [...raw.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length === 0) return [];
  const last = matches[matches.length - 1][1];
  try {
    const arr = JSON.parse(last);
    return (arr as any[]).map((t) => ({
      id: t.id,
      activity: t.activity || "",
      description: t.description || "",
      size: t.size || "small",
      criticality: t.criticality || "normal",
      dependsOn: t.dependsOn || [],
      acceptance: t.acceptance || "",
      engine: t.engine || undefined,
      model: t.model || undefined,
      power: t.power || undefined,
      status: t.engine ? "planejada" : "bloqueada",
    })) as Task[];
  } catch {
    return [];
  }
}

/** Invoca o agente via CLI do plannerEngine e devolve o texto bruto. */
export function runPlanner(
  plannerCfg: EngineConfig,
  prompt: string,
  cwd: string,
  timeoutSec: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    // usa o exec_template do engine planejador, passando o prompt conforme input_mode
    let command = plannerCfg.exec_template
      .replace("{model}", plannerCfg.default_model)
      .replace("{power}", "high") // planejamento exige raciocinio
      .replace("{spec_file}", "")
      .replace("{prompt}", plannerCfg.input_mode === "arg" ? shellQuote("\n" + prompt) : "");
    command = command.replace("{prompt}", "").trim();

    const child = spawn(command, { cwd, shell: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutSec * 1000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    if (plannerCfg.input_mode === "stdin") {
      child.stdin.write(prompt);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || out.length > 0) resolve(out);
      else reject(new Error(`Planner falhou (exit ${code}): ${err.slice(0, 300)}`));
    });
  });
}
