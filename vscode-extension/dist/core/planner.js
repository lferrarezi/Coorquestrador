"use strict";
// src/core/planner.ts
// O raciocinio de planejamento roda como um agente .agent.md, invocado via CLI.
// Aqui montamos o prompt do agente (demanda + contexto + snapshot de engines)
// e parseamos o plano estruturado que ele devolve.
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPlannerPrompt = buildPlannerPrompt;
exports.parsePlan = parsePlan;
exports.runPlanner = runPlanner;
const child_process_1 = require("child_process");
const commandSecurity_1 = require("./commandSecurity");
/** Escapa para uso seguro como argumento unico de shell (aspas simples). */
function shellQuote(s) {
    return `'${s.replace(/'/g, `'\\''`)}'`;
}
/** Monta o prompt enviado ao agente coorquestrador. */
function buildPlannerPrompt(opts) {
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
function parsePlan(raw) {
    const matches = [...raw.matchAll(/```json\s*([\s\S]*?)```/g)];
    if (matches.length === 0)
        return [];
    const last = matches[matches.length - 1][1];
    try {
        const arr = JSON.parse(last);
        if (!Array.isArray(arr))
            return [];
        return arr.map((t) => ({
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
        }));
    }
    catch {
        return [];
    }
}
function normalizeTaskSize(size) {
    const aliases = { XS: "trivial", S: "small", M: "medium", L: "large", XL: "xlarge" };
    return size ? aliases[size] || size : undefined;
}
/** Invoca o agente via CLI do plannerEngine e devolve o texto bruto. */
function runPlanner(plannerCfg, prompt, cwd, timeoutSec) {
    return new Promise((resolve, reject) => {
        (0, commandSecurity_1.assertValidExecTemplate)(plannerCfg, "planner");
        // usa o exec_template do engine planejador, passando o prompt conforme input_mode
        let command = plannerCfg.exec_template
            .replace("{model}", (0, commandSecurity_1.sanitizeTemplateValue)(plannerCfg.default_model, "model"))
            .replace("{power}", "high") // planejamento exige raciocinio
            .replace("{cwd}", shellQuote(cwd))
            .replace("{spec_file}", "")
            .replace("{prompt}", plannerCfg.input_mode === "arg" ? shellQuote("\n" + prompt) : "");
        command = command.replace("{prompt}", "").trim();
        const child = (0, child_process_1.spawn)(command, { cwd, shell: true });
        let out = "";
        let err = "";
        const timer = setTimeout(() => child.kill("SIGTERM"), timeoutSec * 1000);
        child.stdout.on("data", (d) => (out += d.toString()));
        child.stderr.on("data", (d) => (err += d.toString()));
        if (plannerCfg.input_mode === "stdin") {
            child.stdin.write(prompt);
            child.stdin.end();
        }
        else {
            child.stdin.end();
        }
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0 || out.length > 0)
                resolve(out);
            else
                reject(new Error(`Planner falhou (exit ${code}): ${err.slice(0, 300)}`));
        });
    });
}
//# sourceMappingURL=planner.js.map