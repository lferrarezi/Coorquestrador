import { Demand, Task } from "./types";

export function taskDetailMarkdown(demand: Demand, task: Task): string {
  const lines = [
    `# ${task.activity || task.id}`,
    "",
    `- Demanda: ${demand.id} - ${demand.title}`,
    `- Status: ${task.status}`,
    `- Assistente: ${task.engine || "n/d"}`,
    `- Modelo: ${task.model || "n/d"}`,
    `- Esforco: ${task.power || "n/d"}`,
    `- Criticidade: ${task.criticality}`,
    `- Tamanho: ${task.size}`,
    `- Dependencias: ${task.dependsOn.length ? task.dependsOn.join(", ") : "nenhuma"}`,
    `- Cota estimada: ${task.estimatedQuota != null ? `${Math.round(task.estimatedQuota).toLocaleString("pt-BR")} ${task.quotaUnit || ""}` : "n/d"}`,
    `- Cota real: ${task.realQuota != null ? `${Math.round(task.realQuota).toLocaleString("pt-BR")} ${task.quotaUnit || ""}` : "n/d"}`,
    task.durationMs != null ? `- Duracao: ${task.durationMs}ms` : "",
    task.logFile ? `- Log: ${task.logFile}` : "",
    "",
    "## Descricao",
    task.description || "n/d",
    "",
    "## Criterio de aceite",
    task.acceptance || "n/d",
  ].filter(Boolean);
  if (task.artifacts?.length) {
    lines.push("", "## Artefatos", ...task.artifacts.map((a) => `- ${a}`));
  }
  return lines.join("\n");
}
