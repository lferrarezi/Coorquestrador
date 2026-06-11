// src/core/executor.ts
// Executa tarefas via CLI local, respeitando o DAG (paralelo onde independente)
// e os gates HITL (Gate 1 obrigatorio antes de qualquer execucao).

import { spawn } from "child_process";
import { BuiltCommand } from "./commandBuilder";
import { Task } from "./types";

export interface ExecResult {
  taskId: string;
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean;
}

/**
 * Mata a arvore de processos inteira, nao so o shell intermediario.
 * Com shell:true, kill() simples deixa a CLI orfa rodando (e consumindo cota).
 */
function killTree(child: ReturnType<typeof spawn>) {
  if (process.platform === "win32") {
    child.kill();
    return;
  }
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function runBuilt(taskId: string, built: BuiltCommand, cwd: string, timeoutSec: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    // detached cria um process group proprio no POSIX, permitindo matar a arvore.
    const child = spawn(built.command, { cwd, shell: true, detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutSec * 1000);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    if (built.inputMode === "stdin" && built.stdinPayload) {
      child.stdin?.write(built.stdinPayload);
      child.stdin?.end();
    } else {
      child.stdin?.end();
    }

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) stderr += `\n[coorq] tarefa interrompida por timeout (${timeoutSec}s)`;
      resolve({ taskId, code: timedOut ? 124 : (code ?? 1), stdout, stderr, durationMs: Date.now() - start, timedOut });
    });
  });
}

/** Retorna tarefas prontas para rodar: todas as dependencias concluidas. */
function readyTasks(tasks: Task[]): Task[] {
  const done = new Set(tasks.filter((t) => t.status === "concluida" || t.status === "revisao").map((t) => t.id));
  return tasks.filter(
    (t) =>
      (t.status === "aprovada") &&
      t.dependsOn.every((d) => done.has(d))
  );
}

/**
 * Executa o plano aprovado com concorrencia controlada.
 * @param gate1Approved deve ser true (v1: execucao so ocorre apos Gate 1).
 * @param buildFn funcao que monta o BuiltCommand de uma tarefa no momento da execucao.
 * @param onUpdate callback de progresso para a UI atualizar o estado.
 */
export async function executePlan(opts: {
  tasks: Task[];
  cwd: string;
  maxParallel: number;
  execTimeoutSec: number;
  gate1Approved: boolean;
  buildFn: (t: Task) => BuiltCommand;
  runFn?: (taskId: string, built: BuiltCommand, cwd: string, timeoutSec: number) => Promise<ExecResult>;
  onUpdate: (t: Task) => void;
}): Promise<ExecResult[]> {
  if (!opts.gate1Approved) {
    throw new Error("Gate 1 nao aprovado: execucao bloqueada (v1 exige aprovacao de plano+cota).");
  }

  const results: ExecResult[] = [];
  const running = new Map<string, Promise<ExecResult>>();

  // loop ate todas concluidas/rejeitadas/bloqueadas
  while (true) {
    // dispara prontas ate o limite de concorrencia
    let ready = readyTasks(opts.tasks);
    while (running.size < opts.maxParallel && ready.length > 0) {
      const t = ready.shift()!;
      t.status = "executando";
      opts.onUpdate(t);
      const built = opts.buildFn(t);
      t.command = built.command;
      t.redactedCommand = built.redactedCommand;
      t.specFile = built.specFile;
      const runner = opts.runFn || runBuilt;
      const p = runner(t.id, built, opts.cwd, opts.execTimeoutSec).then((r) => {
        t.status = r.code === 0 ? "revisao" : "rejeitada";
        t.log = (r.stdout + "\n" + r.stderr).slice(-4000);
        opts.onUpdate(t);
        return r;
      });
      running.set(t.id, p);
      ready = readyTasks(opts.tasks);
    }

    if (running.size === 0) break; // nada rodando e nada pronto -> fim

    const finished = await Promise.race(running.values());
    running.delete(finished.taskId);
    results.push(finished);
  }

  // dependentes de tarefas rejeitadas nunca ficam prontos: marca como bloqueada
  // em vez de deixa-los presos em "aprovada" silenciosamente.
  for (const t of opts.tasks) {
    if (t.status === "aprovada") {
      t.status = "bloqueada";
      t.log = ((t.log || "") + "\n[coorq] bloqueada: dependencia nao concluida (" +
        t.dependsOn.join(", ") + ")").trim();
      opts.onUpdate(t);
    }
  }

  return results;
}
