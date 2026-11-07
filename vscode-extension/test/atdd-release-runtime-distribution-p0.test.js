#!/usr/bin/env node

// Acceptance coverage for the P0 runtime safety contract.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runChat } = require("../dist/core/chat");
const { CoorqConfig } = require("../dist/core/config");
const estimator = require("../dist/core/estimator");

function chatConfig(overrides = {}) {
  return {
    enabled: true,
    location: "local",
    host: "localhost",
    bin: "fake",
    input_mode: "arg",
    probe: { command: "true", expect_exit_code: 0 },
    credit_probe: { command: "", parse: "json" },
    exec_template: "fake {prompt}",
    chat_exec_template: "fake --sandbox read-only {prompt}",
    chat_read_only: true,
    models: ["default"],
    default_model: "default",
    powers: ["normal"],
    unit: "token",
    best_for: ["test"],
    ...overrides,
  };
}

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "coorq-atdd-p0-"));
}

test("[P0] AC-1 recusa chat com permissao mutavel", async () => {
  // Given um template com permissao mutavel
  const cfg = chatConfig({ chat_exec_template: "fake --permission-mode auto {prompt}" });
  // When o chat e iniciado
  // Then a primeira assercao prova a recusa de seguranca
  await assert.rejects(
    () => runChat(cfg, "consulta", process.cwd(), 1, "normal", () => {}),
    /permissao mutavel/
  );
});

test("[P0] AC-2 recusa chat sem declaracao read-only", async () => {
  // Given um template sem chat_read_only=true
  const cfg = chatConfig({ chat_read_only: undefined });
  // When o chat e iniciado
  // Then a primeira assercao prova a recusa do contrato de seguranca
  await assert.rejects(
    () => runChat(cfg, "consulta", process.cwd(), 1, "normal", () => {}),
    /somente leitura nao foi declarado\/verificado/
  );
});

test("[P0] AC-3 bloqueia Devin sem template de chat seguro", () => {
  // Given a configuracao padrao materializada em um projeto isolado
  const root = tempProject();
  try {
    const config = new CoorqConfig(root, ".coorq");
    config.ensureProjectDefaults();
    const devin = config.loadEngines().engines["devin-cli"];
    // Then a primeira assercao prova que Devin nao recebe chat executavel
    assert.equal(devin.chat_exec_template, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("[P0] AC-4 bloqueia chat em input_mode=file sem materializacao segura", async () => {
  // Given um template read-only que exigiria um arquivo de prompt
  const cfg = chatConfig({ input_mode: "file", chat_exec_template: "fake --sandbox read-only {spec_file}" });
  // When o chat e iniciado
  // Then a primeira assercao prova a recusa do modo sem contrato seguro
  await assert.rejects(
    () => runChat(cfg, "consulta", process.cwd(), 1, "normal", () => {}),
    /input_mode=file/
  );
});

test("[P0] AC-5 preserva defaults read-only na migracao", () => {
  // Given uma configuracao padrao carregada/migrada
  const root = tempProject();
  try {
    const config = new CoorqConfig(root, ".coorq");
    config.ensureProjectDefaults();
    const engines = config.loadEngines().engines;
    // Then a primeira assercao isola a propriedade de seguranca prometida
    assert.equal(engines["claude-code"].chat_read_only, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("[P0] AC-6 rejeita threshold Gate 2 ausente com decisao explicita", () => {
  // Given threshold ausente
  const validate = estimator.validateGate2Threshold;
  // Then a primeira assercao falha ate existir a API de decisao explicita
  assert.equal(typeof validate, "function");
  assert.equal(validate(undefined).valid, false);
});

test("[P0] AC-7 rejeita threshold Gate 2 NaN com decisao explicita", () => {
  // Given threshold NaN
  const validate = estimator.validateGate2Threshold;
  // Then a primeira assercao falha ate existir a API de decisao explicita
  assert.equal(typeof validate, "function");
  assert.equal(validate(Number.NaN).valid, false);
});

test("[P0] AC-8 rejeita threshold Gate 2 negativo com decisao explicita", () => {
  // Given threshold negativo
  const validate = estimator.validateGate2Threshold;
  // Then a primeira assercao falha ate existir a API de decisao explicita
  assert.equal(typeof validate, "function");
  assert.equal(validate(-1).valid, false);
});

test("[P0] AC-9 torna observavel a regra do threshold Gate 2 zero", () => {
  // Given threshold zero, cuja semantica deve ser decidida formalmente
  const validate = estimator.validateGate2Threshold;
  // Then a primeira assercao falha ate existir uma decisao observavel
  assert.equal(typeof validate, "function");
  const decision = validate(0);
  assert.equal(typeof decision.valid, "boolean");
  assert.equal(decision.enabled, false);
});
