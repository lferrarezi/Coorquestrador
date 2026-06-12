// src/core/quotaDashboard.ts
// Dashboard consolidado de cota: cota restante por assistente (probe) +
// consumo historico (history.json) + calibracao estimado vs medido.

import { calibrationBySize, consumptionByEngine } from "./historyStore";
import { EngineSnapshot, ExecutionRecord } from "./types";

function fmt(n: number, unit: string): string {
  if (unit === "acu") return `${Math.round(n * 10) / 10} ACU`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M tokens`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k tokens`;
  return `${Math.round(n)} tokens`;
}

export function quotaDashboardMarkdown(
  snapshots: EngineSnapshot[],
  executions: ExecutionRecord[],
  now = new Date()
): string {
  const lines: string[] = [];
  lines.push(`# Cota dos assistentes`);
  lines.push("");
  lines.push(`> Gerado em ${now.toISOString()} · ${executions.length} execucao(oes) no historico`);
  lines.push("");

  lines.push(`## Cota restante (probe)`);
  lines.push("");
  lines.push(`| Assistente | Estado | Cota restante |`);
  lines.push(`|---|---|---|`);
  for (const s of snapshots) {
    lines.push(`| ${s.id} | ${s.state} | ${s.creditRemaining != null ? s.creditRemaining + "%" : "n/d"} |`);
  }
  lines.push("");

  const consumption = consumptionByEngine(executions);
  lines.push(`## Consumo acumulado por assistente`);
  lines.push("");
  if (consumption.length === 0) {
    lines.push(`(sem execucoes registradas ainda)`);
  } else {
    lines.push(`| Assistente | Tarefas | Estimado | Real* | Medido de fato |`);
    lines.push(`|---|---|---|---|---|`);
    for (const c of consumption) {
      lines.push(`| ${c.engine} | ${c.tasks} | ${fmt(c.totalEstimated, c.unit)} | ${fmt(c.totalReal, c.unit)} | ${c.measuredTasks}/${c.tasks} tarefa(s) (${fmt(c.totalMeasured, c.unit)}) |`);
    }
    lines.push("");
    lines.push(`\\* Real = medido quando disponivel; senao, estimado.`);
  }
  lines.push("");

  const calib = calibrationBySize(executions);
  lines.push(`## Calibracao: estimado vs medido por tamanho`);
  lines.push("");
  if (calib.length === 0) {
    lines.push(`(sem medidas reais ainda — execute tarefas com assistentes que reportam usage)`);
  } else {
    lines.push(`| Tamanho | Unidade | Amostras | Estimativa media | Mediana medida | Razao |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const c of calib) {
      const ratio = c.ratio != null ? `${c.ratio.toFixed(2)}x` : "n/d";
      lines.push(`| ${c.size} | ${c.unit} | ${c.samples} | ${c.declaredEstimate != null ? fmt(c.declaredEstimate, c.unit) : "n/d"} | ${c.measuredMedian != null ? fmt(c.measuredMedian, c.unit) : "n/d"} | ${ratio} |`);
    }
    lines.push("");
    lines.push(`Razao > 1: a classe consome mais que o estimado (aumente task_size na cost-table). Razao < 1: estimativa folgada.`);
  }
  lines.push("");

  const recent = [...executions].slice(-15).reverse();
  lines.push(`## Ultimas execucoes`);
  lines.push("");
  if (recent.length === 0) {
    lines.push(`(nenhuma)`);
  } else {
    lines.push(`| Quando | Tarefa | Assistente/Modelo | Estimado | Real | Exit |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const e of recent) {
      const real = e.measured && e.realQuota != null ? fmt(e.realQuota, e.unit) : "(estimado)";
      lines.push(`| ${e.finishedAt.slice(0, 16).replace("T", " ")} | ${e.demandId}/${e.taskId} | ${e.engine}/${e.model} | ${fmt(e.estimatedQuota, e.unit)} | ${real} | ${e.exitCode} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
