"use strict";
// src/core/executor.ts
// Executa tarefas via CLI local, respeitando o DAG (paralelo onde independente)
// e os gates HITL (Gate 1 obrigatorio antes de qualquer execucao).
Object.defineProperty(exports, "__esModule", { value: true });
exports.executePlan = executePlan;
const child_process_1 = require("child_process");
function runBuilt(taskId, built, cwd, timeoutSec) {
    return new Promise((resolve) => {
        const start = Date.now();
        const child = (0, child_process_1.spawn)(built.command, { cwd, shell: true });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => child.kill("SIGTERM"), timeoutSec * 1000);
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        if (built.inputMode === "stdin" && built.stdinPayload) {
            child.stdin.write(built.stdinPayload);
            child.stdin.end();
        }
        else {
            child.stdin.end();
        }
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ taskId, code: code ?? 1, stdout, stderr, durationMs: Date.now() - start });
        });
    });
}
/** Retorna tarefas prontas para rodar: todas as dependencias concluidas. */
function readyTasks(tasks) {
    const done = new Set(tasks.filter((t) => t.status === "concluida").map((t) => t.id));
    return tasks.filter((t) => (t.status === "aprovada") &&
        t.dependsOn.every((d) => done.has(d)));
}
/**
 * Executa o plano aprovado com concorrencia controlada.
 * @param gate1Approved deve ser true (v1: execucao so ocorre apos Gate 1).
 * @param buildFn funcao que monta o BuiltCommand de uma tarefa no momento da execucao.
 * @param onUpdate callback de progresso para a UI atualizar o estado.
 */
async function executePlan(opts) {
    if (!opts.gate1Approved) {
        throw new Error("Gate 1 nao aprovado: execucao bloqueada (v1 exige aprovacao de plano+custo).");
    }
    const results = [];
    const running = new Map();
    // loop ate todas concluidas/rejeitadas/bloqueadas
    while (true) {
        // dispara prontas ate o limite de concorrencia
        let ready = readyTasks(opts.tasks);
        while (running.size < opts.maxParallel && ready.length > 0) {
            const t = ready.shift();
            t.status = "executando";
            opts.onUpdate(t);
            const built = opts.buildFn(t);
            t.command = built.command;
            t.specFile = built.specFile;
            const p = runBuilt(t.id, built, opts.cwd, opts.execTimeoutSec).then((r) => {
                t.status = r.code === 0 ? "revisao" : "rejeitada";
                t.log = (r.stdout + "\n" + r.stderr).slice(-4000);
                opts.onUpdate(t);
                return r;
            });
            running.set(t.id, p);
            ready = readyTasks(opts.tasks);
        }
        if (running.size === 0)
            break; // nada rodando e nada pronto -> fim
        const finished = await Promise.race(running.values());
        running.delete(finished.taskId);
        results.push(finished);
    }
    return results;
}
//# sourceMappingURL=executor.js.map