#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { validatePlan } = require("../dist/core/planValidation");
const { estimateDemandQuota } = require("../dist/core/estimator");
const { executePlan } = require("../dist/core/executor");
const { DemandStore } = require("../dist/core/demandStore");
const { CoorqConfig } = require("../dist/core/config");
const { buildCommand } = require("../dist/core/commandBuilder");
const { ensureInsideDir, redactCommand, redactSecrets, validateExecTemplate } = require("../dist/core/commandSecurity");
const { discoverInstalledClis, resolveBinPath } = require("../dist/core/prober");

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
})();
