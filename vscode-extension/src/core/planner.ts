// src/core/planner.ts
// O raciocinio de planejamento roda como um agente .agent.md, invocado via CLI.
// Aqui montamos o prompt do agente (demanda + contexto + snapshot de engines)
// e parseamos o plano estruturado que ele devolve.

import * as fs from "fs";
import { spawn } from "child_process";
import { EngineConfig, EngineSnapshot, Task, Demand } from "./types";
import { assertValidExecTemplate, sanitizeTemplateValue } from "./commandSecurity";

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
    if (!Array.isArray(arr)) return [];
    return (arr as any[]).map((t) => ({
      id: t.id,
      activity: t.activity || "",
      description: t.description || "",
      size: normalizeTaskSize(t.size) || "small",
      criticality: t.criticality || "normal",
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
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

function normalizeTaskSize(size: string | undefined): string | undefined {
  const aliases: Record<string, string> = { XS: "trivial", S: "small", M: "medium", L: "large", XL: "xlarge" };
  return size ? aliases[size] || size : undefined;
}

// ---------- Replanejamento parcial (subgrafo que falhou) ----------

export interface PartialReplanInput {
  demand: Demand;
  /** tarefas concluidas: viram contexto, NAO sao replanejadas */
  completed: Task[];
  /** tarefas rejeitadas/bloqueadas: o subgrafo a recuperar */
  failed: Task[];
}

/** Separa o plano em concluidas vs a-recuperar (rejeitadas/bloqueadas). */
export function splitForReplan(demand: Demand): PartialReplanInput {
  const completed = demand.tasks.filter((t) => t.status === "concluida");
  const failed = demand.tasks.filter((t) => t.status === "rejeitada" || t.status === "bloqueada");
  return { demand, completed, failed };
}

/**
 * Prompt de recuperacao: envia ao planejador SO o subgrafo que falhou, com os
 * logs de erro, preservando o que ja foi concluido como contexto fixo.
 */
export function buildReplanPrompt(opts: {
  agentSpec: string;
  skills?: string;
  input: PartialReplanInput;
  projectContext: string;
  snapshot: EngineSnapshot[];
  enginesMeta: Record<string, Pick<EngineConfig, "models" | "powers" | "best_for" | "unit" | "location">>;
}): string {
  const { demand, completed, failed } = opts.input;
  const failedDetail = failed.map((t) => [
    `## ${t.id} (${t.status})`,
    `Descricao: ${t.description}`,
    `Aceite: ${t.acceptance}`,
    `Engine tentado: ${t.engine || "(nenhum)"} / ${t.model || ""}`,
    `Erro (final do log):`,
    "```",
    (t.log || "(sem log)").slice(-1500),
    "```",
  ].join("\n")).join("\n\n");

  return [
    opts.agentSpec,
    opts.skills ? "\n\n---\n\n# SKILLS DO NUCLEO ATIVO\n" + opts.skills : "",
    "\n\n---\n\n# REPLANEJAMENTO PARCIAL\n",
    `Demanda: ${demand.title} (${demand.id})`,
    `Descricao original:\n${demand.description}`,
    "\n# TAREFAS JA CONCLUIDAS (NAO replaneje; sao contexto fixo)\n",
    completed.length
      ? completed.map((t) => `- ${t.id}: ${t.description}`).join("\n")
      : "(nenhuma)",
    "\n# TAREFAS QUE FALHARAM (replaneje SOMENTE estas)\n",
    failedDetail || "(nenhuma)",
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
    "Analise os erros e produza um plano de RECUPERACAO apenas para as tarefas que falharam.",
    "Pode dividir uma tarefa em mais de uma, trocar engine/modelo, ou ajustar a abordagem com base no erro.",
    "Dependencias podem referenciar IDs de tarefas concluidas (ja satisfeitas).",
    "Ao final, inclua um bloco ```json com o array de tarefas no schema:",
    "[{id, activity, description, size, criticality, dependsOn, acceptance, engine, model, power}]",
    "Use SOMENTE engines com state=disponivel e credito suficiente. Tarefas sem engine viavel: engine=null.",
  ].join("\n");
}

/**
 * Funde o plano de recuperacao na demanda: mantem as concluidas, remove as que
 * falharam e adiciona as novas (IDs colidentes ganham sufixo -r).
 */
export function mergeReplanned(demand: Demand, replanned: Task[]): Demand {
  const keep = demand.tasks.filter((t) => t.status === "concluida");
  const keepIds = new Set(keep.map((t) => t.id));
  const seen = new Set<string>(keepIds);
  const fresh = replanned.map((t) => {
    let id = t.id;
    while (seen.has(id)) id = `${id}-r`;
    seen.add(id);
    return { ...t, id };
  });
  // dependencias para IDs concluidos permanecem validas (executor as considera satisfeitas)
  demand.tasks = [...keep, ...fresh];
  demand.status = "aguardando-gate1";
  return demand;
}

/** Invoca o agente via CLI do plannerEngine e devolve o texto bruto. */
export function runPlanner(
  plannerCfg: EngineConfig,
  prompt: string,
  cwd: string,
  timeoutSec: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    assertValidExecTemplate(plannerCfg, "planner");
    // usa o exec_template do engine planejador, passando o prompt conforme input_mode
    let command = plannerCfg.exec_template
      .replace("{model}", sanitizeTemplateValue(plannerCfg.default_model, "model"))
      .replace("{power}", "high") // planejamento exige raciocinio
      .replace("{cwd}", shellQuote(cwd))
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
