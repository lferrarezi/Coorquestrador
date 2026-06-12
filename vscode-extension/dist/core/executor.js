"use strict";
// src/core/executor.ts
// Executa tarefas via CLI local, respeitando o DAG (paralelo onde independente)
// e os gates HITL (Gate 1 obrigatorio antes de qualquer execucao).
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionController = void 0;
exports.windowsTaskkillArgs = windowsTaskkillArgs;
exports.executePlan = executePlan;
const child_process_1 = require("child_process");
/**
 * Mata a arvore de processos inteira, nao so o shell intermediario.
 * Com shell:true, kill() simples deixa a CLI orfa rodando (e consumindo cota).
 */
function killTree(child) {
    if (process.platform === "win32") {
        if (!child.pid) {
            child.kill();
            return;
        }
        const killer = (0, child_process_1.spawn)("taskkill", windowsTaskkillArgs(child.pid), { windowsHide: true, shell: false });
        const fallback = () => { try {
            child.kill();
        }
        catch { /* processo ja encerrou */ } };
        killer.once("error", fallback);
        killer.once("close", (code) => { if (code !== 0)
            fallback(); });
        return;
    }
    try {
        if (child.pid)
            process.kill(-child.pid, "SIGTERM");
        else
            child.kill("SIGTERM");
    }
    catch {
        child.kill("SIGTERM");
    }
}
function windowsTaskkillArgs(pid) {
    return ["/pid", String(pid), "/T", "/F"];
}
/**
 * Controlador de execucao: permite cancelar tudo que esta rodando (mata as
 * arvores de processo) e impede novos disparos.
 */
class ExecutionController {
    constructor() {
        this._cancelled = false;
        this.children = new Set();
    }
    get cancelled() { return this._cancelled; }
    cancel() {
        this._cancelled = true;
        for (const c of this.children)
            killTree(c);
    }
    /** uso interno do executor */
    track(child) {
        this.children.add(child);
        child.on("close", () => this.children.delete(child));
    }
}
exports.ExecutionController = ExecutionController;
function runBuilt(taskId, built, cwd, timeoutSec, hooks = {}) {
    return new Promise((resolve) => {
        const start = Date.now();
        // detached cria um process group proprio no POSIX, permitindo matar a arvore.
        const child = (0, child_process_1.spawn)(built.command, { cwd, shell: true, detached: process.platform !== "win32" });
        hooks.controller?.track(child);
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutSec * 1000);
        child.stdout?.on("data", (d) => { const s = d.toString(); stdout += s; hooks.onOutput?.(taskId, s); });
        child.stderr?.on("data", (d) => { const s = d.toString(); stderr += s; hooks.onOutput?.(taskId, s); });
        if (built.inputMode === "stdin" && built.stdinPayload) {
            child.stdin?.write(built.stdinPayload);
            child.stdin?.end();
        }
        else {
            child.stdin?.end();
        }
        child.on("close", (code) => {
            clearTimeout(timer);
            const cancelled = hooks.controller?.cancelled === true;
            if (timedOut)
                stderr += `\n[coorq] tarefa interrompida por timeout (${timeoutSec}s)`;
            if (cancelled)
                stderr += "\n[coorq] execucao cancelada pelo usuario";
            resolve({
                taskId,
                code: cancelled ? 130 : timedOut ? 124 : (code ?? 1),
                stdout, stderr,
                durationMs: Date.now() - start,
                timedOut,
                cancelled,
            });
        });
    });
}
/** Retorna tarefas prontas para rodar: todas as dependencias concluidas. */
function readyTasks(tasks) {
    const done = new Set(tasks.filter((t) => t.status === "concluida" || t.status === "revisao").map((t) => t.id));
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
        throw new Error("Gate 1 nao aprovado: execucao bloqueada (v1 exige aprovacao de plano+cota).");
    }
    const results = [];
    const running = new Map();
    const hooks = { controller: opts.controller, onOutput: opts.onOutput };
    // loop ate todas concluidas/rejeitadas/bloqueadas
    while (true) {
        // dispara prontas ate o limite de concorrencia (cancelado = nao dispara mais)
        let ready = opts.controller?.cancelled ? [] : readyTasks(opts.tasks);
        while (running.size < opts.maxParallel && ready.length > 0) {
            const t = ready.shift();
            t.status = "executando";
            opts.onUpdate(t);
            let built;
            try {
                built = opts.buildFn(t);
            }
            catch (e) {
                t.status = "rejeitada";
                t.log = `[coorq] falha ao montar comando: ${String(e?.message || e)}`;
                opts.onUpdate(t);
                ready = opts.controller?.cancelled ? [] : readyTasks(opts.tasks);
                continue;
            }
            t.command = built.command;
            t.redactedCommand = built.redactedCommand;
            t.specFile = built.specFile;
            const runner = opts.runFn || runBuilt;
            const p = runner(t.id, built, opts.cwd, opts.execTimeoutSec, hooks).then((r) => {
                t.status = r.code === 0 ? "revisao" : "rejeitada";
                t.cancelled = r.cancelled || undefined;
                t.log = (r.stdout + "\n" + r.stderr).slice(-4000);
                opts.onUpdate(t);
                return r;
            });
            running.set(t.id, p);
            ready = opts.controller?.cancelled ? [] : readyTasks(opts.tasks);
        }
        if (running.size === 0)
            break; // nada rodando e nada pronto -> fim
        const finished = await Promise.race(running.values());
        running.delete(finished.taskId);
        results.push(finished);
    }
    // dependentes de tarefas rejeitadas (ou restantes pos-cancelamento) nunca ficam
    // prontos: marca como bloqueada em vez de deixa-los presos em "aprovada".
    for (const t of opts.tasks) {
        if (t.status === "aprovada") {
            t.status = "bloqueada";
            const why = opts.controller?.cancelled
                ? "execucao cancelada pelo usuario"
                : `dependencia nao concluida (${t.dependsOn.join(", ")})`;
            t.log = ((t.log || "") + `\n[coorq] bloqueada: ${why}`).trim();
            opts.onUpdate(t);
        }
    }
    return results;
}
//# sourceMappingURL=executor.js.map