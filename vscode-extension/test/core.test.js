#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { validatePlan } = require("../dist/core/planValidation");
const { estimateDemandQuota } = require("../dist/core/estimator");
const { executePlan, ExecutionController, windowsTaskkillArgs } = require("../dist/core/executor");
const { measureUsage } = require("../dist/core/usageParser");
const { rerouteForQuota } = require("../dist/core/rerouting");
const { HistoryStore, consumptionByEngine, calibrationBySize } = require("../dist/core/historyStore");
const { quotaDashboardMarkdown } = require("../dist/core/quotaDashboard");
const { parseReviewOutput, reviewTask } = require("../dist/core/reviewer");
const { splitForReplan, buildReplanPrompt, mergeReplanned } = require("../dist/core/planner");
const { DemandStore } = require("../dist/core/demandStore");
const { CoorqConfig } = require("../dist/core/config");
const { buildCommand } = require("../dist/core/commandBuilder");
const { ensureInsideDir, redactCommand, redactSecrets, validateExecTemplate } = require("../dist/core/commandSecurity");
const { discoverInstalledClis, discoverModels, resolveBinPath, probeAll, invalidateProbeCache } = require("../dist/core/prober");
const { gate2ReasonsForTask } = require("../dist/core/executionService");
const { taskDetailMarkdown } = require("../dist/core/taskDetails");

function baseEngines() {
  return {
    defaults: {
      min_credit_threshold: 0.05,
      probe_timeout_seconds: 1,
      exec_timeout_seconds: 1,
      max_parallel: 2,
    },
    engines: {
      codex: {
        enabled: true,
        location: "local",
        host: "localhost",
        bin: "codex",
        input_mode: "arg",
        probe: { command: "codex --version", expect_exit_code: 0 },
        credit_probe: { command: "", parse: "json" },
        exec_template: "codex exec --model {model} {prompt}",
        models: ["gpt-5.4"],
        default_model: "gpt-5.4",
        powers: ["normal", "high"],
        unit: "token",
        best_for: ["coding"],
      },
    },
  };
}

function task(id, dependsOn = []) {
  return {
    id,
    activity: `activity ${id}`,
    description: `description ${id}`,
    size: "small",
    criticality: "normal",
    dependsOn,
    acceptance: `acceptance ${id}`,
    engine: "codex",
    model: "gpt-5.4",
    power: "normal",
    status: "planejada",
  };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

(async () => {
  await test("validatePlan accepts a valid routed DAG", () => {
    const tasks = [task("T1"), task("T2", ["T1"])];
    const result = validatePlan(tasks, baseEngines(), [{ id: "codex", state: "disponivel", creditRemaining: 0.9, probedAt: "now", detail: "" }]);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  await test("validatePlan rejects cycles and invalid models", () => {
    const tasks = [task("T1", ["T2"]), task("T2", ["T1"])];
    tasks[0].model = "invalid";
    const result = validatePlan(tasks, baseEngines(), [{ id: "codex", state: "disponivel", creditRemaining: 0.9, probedAt: "now", detail: "" }]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("modelo invalido")));
    assert.ok(result.errors.some((e) => e.includes("ciclo")));
  });

  await test("validatePlan accepts dependencies already satisfied by completed tasks", () => {
    const tasks = [task("T2", ["T1"] )];
    const result = validatePlan(
      tasks,
      baseEngines(),
      [{ id: "codex", state: "disponivel", creditRemaining: 90, probedAt: "now", detail: "" }],
      5,
      new Set(["T1"])
    );
    assert.equal(result.valid, true);
  });

  await test("estimateDemandQuota aggregates by engine and unit", () => {
    const cost = {
      currency: "USD",
      power_multiplier: { normal: 1, high: 3 },
      models: { "gpt-5.4": { unit: "token" } },
      task_size_tokens: { small: 100, medium: 500 },
      task_size_acu: { small: 1, medium: 3 },
      cost_gate2_threshold: 5,
    };
    const tasks = [task("T1"), { ...task("T2"), size: "medium", power: "high" }];
    const estimate = estimateDemandQuota(tasks, cost);
    assert.equal(estimate.perTask.T1.amount, 100);
    assert.equal(estimate.perTask.T2.amount, 1500);
    assert.equal(estimate.byEngine.codex.amount, 1600);
    assert.equal(estimate.totalByUnit.token, 1600);
  });

  await test("executePlan respects DAG ordering with injected runner", async () => {
    const tasks = [task("T1"), task("T2", ["T1"])];
    tasks.forEach((t) => { t.status = "aprovada"; });
    const order = [];
    await executePlan({
      tasks,
      cwd: process.cwd(),
      maxParallel: 2,
      execTimeoutSec: 1,
      gate1Approved: true,
      buildFn: () => ({ command: "noop", redactedCommand: "noop", inputMode: "arg" }),
      runFn: async (taskId) => {
        order.push(taskId);
        return { taskId, code: 0, stdout: "", stderr: "", durationMs: 1 };
      },
      onUpdate: () => {},
    });
    assert.deepEqual(order, ["T1", "T2"]);
    assert.equal(tasks[1].status, "revisao");
  });

  await test("executePlan blocks dependents of rejected tasks", async () => {
    const tasks = [task("T1"), task("T2", ["T1"]), task("T3")];
    tasks.forEach((t) => { t.status = "aprovada"; });
    const updates = [];
    await executePlan({
      tasks,
      cwd: process.cwd(),
      maxParallel: 2,
      execTimeoutSec: 1,
      gate1Approved: true,
      buildFn: () => ({ command: "noop", redactedCommand: "noop", inputMode: "arg" }),
      runFn: async (taskId) => ({ taskId, code: taskId === "T1" ? 1 : 0, stdout: "", stderr: "", durationMs: 1 }),
      onUpdate: (t) => updates.push(`${t.id}:${t.status}`),
    });
    assert.equal(tasks[0].status, "rejeitada");
    assert.equal(tasks[1].status, "bloqueada");
    assert.ok(tasks[1].log.includes("dependencia nao concluida"));
    assert.equal(tasks[2].status, "revisao");
    assert.ok(updates.includes("T2:bloqueada"));
  });

  await test("executePlan marks timeout with code 124 and kills the process tree", async () => {
    if (process.platform === "win32") return; // usa sleep/sh do POSIX
    const tasks = [task("T1")];
    tasks[0].status = "aprovada";
    const results = await executePlan({
      tasks,
      cwd: process.cwd(),
      maxParallel: 1,
      execTimeoutSec: 1,
      gate1Approved: true,
      buildFn: () => ({ command: "sh -c 'sleep 30'", redactedCommand: "sleep", inputMode: "arg" }),
      onUpdate: () => {},
    });
    assert.equal(results[0].code, 124);
    assert.equal(results[0].timedOut, true);
    assert.ok(results[0].stderr.includes("timeout"));
    assert.equal(tasks[0].status, "rejeitada");
    assert.ok(results[0].durationMs < 5000, "deve encerrar logo apos o timeout, nao apos o sleep");
  });

  await test("probeAll caches snapshots within TTL and force bypasses", async () => {
    invalidateProbeCache();
    const ef = baseEngines();
    ef.engines.codex.probe = { command: "true", expect_exit_code: 0 };
    const a = await probeAll(ef);
    const b = await probeAll(ef);            // cache hit: mesmo array
    assert.equal(a, b);
    const c = await probeAll(ef, { force: true });
    assert.notEqual(b, c);                   // force re-executa
    const d = await probeAll(ef, { cacheTtlMs: 0 });
    assert.notEqual(c, d);                   // ttl 0 desativa cache
    invalidateProbeCache();
  });

  await test("DemandStore writes atomically and loads saved demand", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coorq-store-"));
    const store = new DemandStore(path.join(dir, "state", "demands.json"));
    const demand = { id: "D1", project: "p", title: "t", description: "d", createdAt: "now", status: "nova", tasks: [] };
    store.upsert(demand);
    assert.equal(store.get("D1").title, "t");
  });

  await test("validateExecTemplate rejects unknown placeholders", () => {
    const cfg = baseEngines().engines.codex;
    const errors = validateExecTemplate({ ...cfg, exec_template: "codex {prompt} {bad}" }, "codex");
    assert.ok(errors.some((e) => e.includes("placeholder desconhecido")));
  });

  await test("buildCommand quotes prompt and rejects unsafe model", () => {
    const cfg = baseEngines().engines.codex;
    const t = task("T1");
    t.model = "gpt-5.4;rm";
    assert.throws(() => buildCommand(t, cfg, "hello", process.cwd(), path.join(os.tmpdir(), "specs")), /model contem/);

    t.model = "gpt-5.4";
    const built = buildCommand(t, cfg, "hello 'quoted' $TOKEN", process.cwd(), path.join(os.tmpdir(), "specs"));
    assert.ok(built.command.includes("'hello '\\''quoted'\\'' $TOKEN'"));
    assert.ok(built.redactedCommand.includes("[REDACTED]"));
  });

  await test("redaction masks common secrets", () => {
    assert.equal(redactSecrets("OPENAI_API_KEY=sk-abc123456789XYZ"), "OPENAI_API_KEY=[REDACTED]");
    assert.equal(redactCommand("tool --prompt 'secret prompt'"), "tool --prompt '[REDACTED]'");
  });

  await test("ensureInsideDir rejects path traversal", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coorq-specs-"));
    assert.throws(() => ensureInsideDir(path.join(dir, "..", "escape.spec.md"), dir), /fora do diretorio/);
    assert.equal(ensureInsideDir(path.join(dir, "ok.spec.md"), dir), path.join(dir, "ok.spec.md"));
  });

  await test("discoverInstalledClis finds configured CLI and declared models", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coorq-cli-"));
    const bin = path.join(dir, "fakeai");
    fs.writeFileSync(bin, "#!/bin/sh\necho fakeai 1.0\n", { mode: 0o755 });
    const oldPath = process.env.PATH;
    process.env.PATH = `${dir}${path.delimiter}${oldPath || ""}`;
    try {
      const engines = baseEngines();
      engines.engines.fakeai = {
        ...engines.engines.codex,
        bin: "fakeai",
        models_probe: undefined,
        models: ["fake-model-a", "fake-model-b"],
        default_model: "fake-model-a",
      };
      const result = await discoverInstalledClis(1, engines);
      const fake = result.find((cli) => cli.id === "fakeai");
      assert.ok(fake);
      assert.equal(fake.installed, true);
      assert.equal(fake.binPath, bin);
      assert.deepEqual(fake.models, ["fake-model-a", "fake-model-b"]);
      assert.deepEqual(fake.modelPowers["fake-model-a"], ["normal", "high"]);
    } finally {
      process.env.PATH = oldPath;
    }
  });

  await test("resolveBinPath supports Windows PATHEXT lookup", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coorq-winpath-"));
    const bin = path.join(dir, "fakeai.cmd");
    fs.writeFileSync(bin, "@echo off\r\necho fakeai\r\n");
    const resolved = resolveBinPath("fakeai", { PATH: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD" }, "win32");
    assert.equal(resolved, bin);
  });

  await test("resolveBinPath checks Windows npm global bin when PATH is incomplete", () => {
    const appData = fs.mkdtempSync(path.join(os.tmpdir(), "coorq-appdata-"));
    const npmDir = path.join(appData, "npm");
    fs.mkdirSync(npmDir, { recursive: true });
    const bin = path.join(npmDir, "codex.cmd");
    fs.writeFileSync(bin, "@echo off\r\necho codex\r\n");
    const resolved = resolveBinPath("codex", { PATH: "", APPDATA: appData, PATHEXT: ".COM;.EXE;.BAT;.CMD" }, "win32");
    assert.equal(resolved, bin);
  });

  await test("ensureProjectDefaults creates .coorq in the open project", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coorq-project-"));
    const conf = new CoorqConfig(dir, ".coorq");
    conf.ensureProjectDefaults();
    assert.ok(fs.existsSync(path.join(dir, ".coorq", "engines.yaml")));
    assert.ok(fs.existsSync(path.join(dir, ".coorq", "cost-table.yaml")));
    assert.ok(fs.existsSync(path.join(dir, ".coorq", "coorq-hitl-gates.yaml")));
    assert.ok(fs.existsSync(path.join(dir, ".coorq", "agent-packs", "base", "coorquestrador.agent.md")));
    assert.equal(conf.loadEngines().engines.codex.bin, "codex");
    assert.equal(conf.activePack(), "base");
  });

  await test("loadEngines migrates old Gemini template and filters unavailable models", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coorq-gemini-"));
    const conf = new CoorqConfig(dir, ".coorq");
    conf.ensureProjectDefaults();
    const enginesPath = path.join(dir, ".coorq", "engines.yaml");
    let raw = fs.readFileSync(enginesPath, "utf8");
    raw = raw.replace("models: [gemini-2.5-pro, gemini-2.5-flash]", "models: [gemini-3.5-flash, gemini-2.5-pro]");
    raw = raw.replace("TERM=xterm-256color NO_COLOR=1 gemini -m {model} --approval-mode plan --skip-trust --output-format text -p {prompt}", "gemini -m {model} --approval-mode yolo -p {prompt}");
    fs.writeFileSync(enginesPath, raw, "utf8");

    const gemini = conf.loadEngines().engines["gemini-cli"];
    assert.ok(gemini.exec_template.includes("--approval-mode plan"));
    assert.deepEqual(gemini.models, ["gemini-2.5-pro"]);
  });

  await test("discoverModels ignores stale Gemini local-state candidates", async () => {
    const models = await discoverModels({
      ...baseEngines().engines.codex,
      bin: "gemini",
      models_probe: { command: "printf 'gemini-3.5-flash\\n'", parse: "lines" },
    }, 1);
    assert.deepEqual(models, []);
  });

  await test("chat webview forwards toolbar commands", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "chatPanel.ts"), "utf8");
    assert.ok(src.includes('case "cmd"'));
    assert.ok(src.includes("vscode.commands.executeCommand(msg.command)"));
  });

  await test("gate2 reasons include impact beyond quota", () => {
    const cost = {
      currency: "USD",
      power_multiplier: { normal: 1 },
      models: { "gpt-5.4": { unit: "token" } },
      task_size_tokens: { small: 100 },
      task_size_acu: { small: 1 },
      cost_gate2_threshold: 999,
      quota_gate2_threshold: { token: 999999 },
    };
    const t = { ...task("T-impact"), criticality: "alta", artifacts: ["src/app.ts"], log: "modified src/app.ts" };
    const reasons = gate2ReasonsForTask(t, cost);
    assert.ok(reasons.includes("criticidade alta"));
    assert.ok(reasons.includes("artefatos gerados ou alterados"));
    assert.ok(reasons.includes("impacto em arquivos detectado no log"));
  });

  await test("task detail markdown contains operational fields", () => {
    const demand = { id: "D1", title: "Demand", description: "Desc", project: ".", createdAt: "now", status: "em-execucao", tasks: [] };
    const t = { ...task("T-detail"), estimatedQuota: 1200, realQuota: 900, quotaUnit: "token", durationMs: 42, logFile: "/tmp/t.log" };
    const md = taskDetailMarkdown(demand, t);
    assert.ok(md.includes("# activity T-detail"));
    assert.ok(md.includes("- Assistente: codex"));
    assert.ok(md.includes("- Cota estimada: 1.200 token"));
    assert.ok(md.includes("- Log: /tmp/t.log"));
  });

  await test("package contributes task detail and rerun commands", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    const commands = pkg.contributes.commands.map((c) => c.command);
    assert.ok(commands.includes("coorq.showTaskDetails"));
    assert.ok(commands.includes("coorq.rerunTask"));
    assert.ok(commands.includes("coorq.quotaDashboard"));
  });

  await test("measureUsage extracts claude json usage and codex tokens-used", () => {
    const cfg = baseEngines().engines.codex;
    const claudeOut = JSON.stringify({ result: "ok", usage: { input_tokens: 1200, output_tokens: 300 } });
    assert.deepEqual(measureUsage({ ...cfg, unit: "token" }, claudeOut), { unit: "token", amount: 1500 });
    assert.deepEqual(measureUsage(cfg, "trabalho feito\ntokens used: 12,345\n"), { unit: "token", amount: 12345 });
    assert.equal(measureUsage(cfg, "saida sem usage"), null);
  });

  await test("measureUsage honors declared usage_parse regex", () => {
    const cfg = { ...baseEngines().engines.codex, usage_parse: { parse: "regex", pattern: "consumo=(\\d+)" } };
    assert.deepEqual(measureUsage(cfg, "blah consumo=777 blah"), { unit: "token", amount: 777 });
  });

  await test("measureUsage accepts numeric strings from declared json paths", () => {
    const cfg = { ...baseEngines().engines.codex, usage_parse: { parse: "json", json_path: "$.usage.total" } };
    assert.deepEqual(measureUsage(cfg, JSON.stringify({ usage: { total: "1,234" } })), { unit: "token", amount: 1234 });
  });

  await test("rerouteForQuota moves task off exhausted engine and blocks when none eligible", () => {
    const ef = baseEngines();
    ef.engines.backup = { ...ef.engines.codex, bin: "backup", best_for: ["coding"], models: ["m1"], default_model: "m1" };
    const t = task("T1");
    t.status = "planejada";
    const snaps = [
      { id: "codex", state: "sem-credito", creditRemaining: 0, probedAt: "now", detail: "" },
      { id: "backup", state: "disponivel", creditRemaining: 80, probedAt: "now", detail: "" },
    ];
    const changes = rerouteForQuota([t], ef, snaps, 5);
    assert.equal(changes.length, 1);
    assert.equal(t.engine, "backup");
    assert.equal(t.model, "m1");
    assert.equal(t.rerouted.from, "codex");

    const t2 = task("T2");
    const noneEligible = [{ id: "codex", state: "sem-credito", creditRemaining: 0, probedAt: "now", detail: "" }];
    const changes2 = rerouteForQuota([t2], baseEngines(), noneEligible, 5);
    assert.equal(changes2.length, 0);
    assert.equal(t2.status, "bloqueada");
    assert.equal(t2.engine, undefined);
    assert.equal(t2.model, undefined);
    assert.equal(t2.power, undefined);
  });

  await test("rerouteForQuota selects effort supported by the replacement model", () => {
    const ef = baseEngines();
    ef.engines.backup = {
      ...ef.engines.codex,
      models: ["fast"],
      default_model: "fast",
      powers: ["low", "normal", "high"],
      model_powers: { fast: ["low"] },
    };
    const t = { ...task("T-power"), power: "high" };
    rerouteForQuota([t], ef, [
      { id: "codex", state: "sem-credito", creditRemaining: 0, probedAt: "now", detail: "" },
      { id: "backup", state: "disponivel", creditRemaining: 90, probedAt: "now", detail: "" },
    ], 5);
    assert.equal(t.engine, "backup");
    assert.equal(t.model, "fast");
    assert.equal(t.power, "low");
  });

  await test("history store aggregates consumption and calibration", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coorq-hist-"));
    const store = new HistoryStore(path.join(dir, "state", "history.json"));
    const base = { demandId: "D1", model: "m", power: "normal", durationMs: 10, finishedAt: "2026-06-02T00:00:00Z" };
    store.appendExecution({ ...base, taskId: "T1", engine: "codex", size: "small", unit: "token", estimatedQuota: 100, realQuota: 150, measured: true, exitCode: 0 });
    store.appendExecution({ ...base, taskId: "T2", engine: "codex", size: "small", unit: "token", estimatedQuota: 100, realQuota: null, measured: false, exitCode: 0 });
    store.appendRoutingOverride({ at: "now", context: "rerun", suggestedEngine: "codex", chosenEngine: "claude-code" });
    const shape = store.load();
    assert.equal(shape.executions.length, 2);
    assert.equal(shape.routingOverrides.length, 1);
    const cons = consumptionByEngine(shape.executions);
    assert.equal(cons[0].engine, "codex");
    assert.equal(cons[0].totalEstimated, 200);
    assert.equal(cons[0].totalReal, 250);       // 150 medido + 100 estimado
    assert.equal(cons[0].totalMeasured, 150);
    const calib = calibrationBySize(shape.executions);
    assert.equal(calib.length, 1);
    assert.equal(calib[0].samples, 1);
    assert.equal(calib[0].ratio, 1.5);
  });

  await test("quota dashboard markdown includes probe, consumption and calibration", () => {
    const snaps = [{ id: "codex", state: "disponivel", creditRemaining: 82, probedAt: "now", detail: "" }];
    const execs = [{ demandId: "D1", taskId: "T1", engine: "codex", model: "m", power: "normal", size: "small", unit: "token", estimatedQuota: 100, realQuota: 150, measured: true, exitCode: 0, durationMs: 5, finishedAt: "2026-06-02T00:00:00Z" }];
    const md = quotaDashboardMarkdown(snaps, execs, new Date("2026-06-02T12:00:00Z"));
    assert.ok(md.includes("| codex | disponivel | 82% |"));
    assert.ok(md.includes("Consumo acumulado por assistente"));
    assert.ok(md.includes("Calibracao: estimado vs medido"));
    assert.ok(md.includes("1.50x"));
  });

  await test("reviewer parses verdict and survives runner failure", async () => {
    const ok = parseReviewOutput("VEREDITO: APROVADO\nRESUMO: tudo certo conforme o aceite.", "codex/m");
    assert.equal(ok.ok, true);
    assert.ok(ok.summary.includes("tudo certo"));
    const bad = parseReviewOutput("VEREDITO: REPROVADO\nRESUMO: faltou o arquivo X.", "codex/m");
    assert.equal(bad.ok, false);

    const t = { ...task("T1"), log: "saida" };
    const verdict = await reviewTask(t, baseEngines(), process.cwd(), 5, undefined, async () => {
      throw new Error("cli quebrou");
    });
    assert.equal(verdict.ok, false);
    assert.ok(verdict.summary.includes("revisao falhou"));
  });

  await test("partial replan splits, prompts with error logs and merges preserving completed", () => {
    const done = { ...task("T1"), status: "concluida" };
    const failed = { ...task("T2", ["T1"]), status: "rejeitada", log: "Error: explodiu na linha 42" };
    const demand = { id: "D1", project: ".", title: "Demo", description: "desc", createdAt: "now", status: "bloqueada", tasks: [done, failed] };
    const input = splitForReplan(demand);
    assert.equal(input.completed.length, 1);
    assert.equal(input.failed.length, 1);

    const prompt = buildReplanPrompt({
      agentSpec: "spec", input, projectContext: "",
      snapshot: [], enginesMeta: {},
    });
    assert.ok(prompt.includes("REPLANEJAMENTO PARCIAL"));
    assert.ok(prompt.includes("explodiu na linha 42"));
    assert.ok(prompt.includes("- T1: description T1"));

    const merged = mergeReplanned(demand, [{ ...task("T1"), status: "planejada" }, { ...task("T3"), status: "planejada" }]);
    const ids = merged.tasks.map((t) => t.id).sort();
    assert.deepEqual(ids, ["T1", "T1-r", "T3"]);           // colisao com concluida ganha sufixo
    assert.equal(merged.tasks.find((t) => t.id === "T1").status, "concluida");
    assert.equal(merged.status, "aguardando-gate1");
  });

  await test("partial replan remaps dependencies when a new id collides with completed work", () => {
    const done = { ...task("T1"), status: "concluida" };
    const failed = { ...task("T2", ["T1"]), status: "rejeitada" };
    const demand = { id: "D2", project: ".", title: "Demo", description: "desc", createdAt: "now", status: "bloqueada", tasks: [done, failed] };
    const merged = mergeReplanned(demand, [
      { ...task("T1"), status: "planejada" },
      { ...task("T3", ["T1"]), status: "planejada" },
    ]);
    assert.equal(merged.tasks.find((t) => t.id === "T3").dependsOn[0], "T1-r");
  });

  await test("windows cancellation targets the full process tree", () => {
    assert.deepEqual(windowsTaskkillArgs(4321), ["/pid", "4321", "/T", "/F"]);
  });

  await test("executePlan rejects a task when command construction fails", async () => {
    const tasks = [task("T-build")];
    tasks[0].status = "aprovada";
    const results = await executePlan({
      tasks,
      cwd: process.cwd(),
      maxParallel: 1,
      execTimeoutSec: 1,
      gate1Approved: true,
      buildFn: () => { throw new Error("config invalida"); },
      onUpdate: () => {},
    });
    assert.equal(results.length, 0);
    assert.equal(tasks[0].status, "rejeitada");
    assert.ok(tasks[0].log.includes("config invalida"));
  });

  await test("execution controller cancels pending tasks", async () => {
    const tasks = [task("T1"), task("T2")];
    tasks.forEach((t) => { t.status = "aprovada"; });
    const controller = new ExecutionController();
    const results = await executePlan({
      tasks,
      cwd: process.cwd(),
      maxParallel: 1,
      execTimeoutSec: 5,
      gate1Approved: true,
      controller,
      buildFn: () => ({ command: "noop", redactedCommand: "noop", inputMode: "arg" }),
      runFn: async (taskId) => {
        controller.cancel(); // cancela durante a primeira tarefa
        return { taskId, code: 0, stdout: "", stderr: "", durationMs: 1 };
      },
      onUpdate: () => {},
    });
    assert.equal(results.length, 1);                        // so a primeira rodou
    assert.equal(tasks[1].status, "bloqueada");             // a segunda nao dispara
    assert.ok(tasks[1].log.includes("cancelada"));
  });
})();
