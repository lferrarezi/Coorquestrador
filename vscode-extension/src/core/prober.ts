// src/core/prober.ts
// Probe hibrido: a config declara os engines; aqui validamos em runtime.

import { exec } from "child_process";
import { EnginesFile } from "./config";
import { EngineConfig, EngineSnapshot, EngineState } from "./types";

function run(cmd: string, timeoutSec: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    if (!cmd || !cmd.trim()) {
      resolve({ code: -1, stdout: "", stderr: "no-command" });
      return;
    }
    exec(cmd, { timeout: timeoutSec * 1000 }, (err, stdout, stderr) => {
      const code = err && typeof (err as any).code === "number" ? (err as any).code : err ? 1 : 0;
      resolve({ code, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

function jsonPath(obj: any, expr: string): number | null {
  // suporte minimo a "$.a.b.c"
  if (!expr || !expr.startsWith("$.")) return null;
  const keys = expr.slice(2).split(".");
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return null;
    cur = cur[k];
  }
  return typeof cur === "number" ? cur : null;
}

export async function probeEngine(
  id: string,
  cfg: EngineConfig,
  timeoutSec: number
): Promise<EngineSnapshot> {
  const now = new Date().toISOString();

  if (!cfg.enabled) {
    return { id, state: "offline", creditRemaining: null, probedAt: now, detail: "desabilitado na config" };
  }

  // 1) disponibilidade + autenticacao
  const av = await run(cfg.probe.command, timeoutSec);
  let state: EngineState;
  let detail = "";
  if (av.code === cfg.probe.expect_exit_code) {
    state = "disponivel";
  } else if (/auth|login|unauthorized|nao.?autenticado/i.test(av.stderr + av.stdout)) {
    state = "nao-autenticado";
    detail = "probe indicou falta de autenticacao";
  } else {
    state = "offline";
    detail = `probe falhou (exit ${av.code}) ${av.stderr.slice(0, 120)}`;
  }

  // 2) credito (se houver credit_probe)
  let creditRemaining: number | null = null;
  if (state === "disponivel" && cfg.credit_probe?.command) {
    const cr = await run(cfg.credit_probe.command, timeoutSec);
    if (cr.code === 0) {
      if (cfg.credit_probe.parse === "json") {
        try {
          const obj = JSON.parse(cr.stdout);
          creditRemaining = jsonPath(obj, cfg.credit_probe.json_path || "");
        } catch { /* ignore */ }
      } else {
        const m = cr.stdout.match(/[\d.]+/);
        creditRemaining = m ? parseFloat(m[0]) : null;
      }
    }
    if (creditRemaining !== null && creditRemaining <= 0) {
      state = "sem-credito";
      detail = "credit_probe retornou <= 0";
    }
  }

  return { id, state, creditRemaining, probedAt: now, detail };
}

export async function probeAll(enginesFile: EnginesFile): Promise<EngineSnapshot[]> {
  const t = enginesFile.defaults.probe_timeout_seconds;
  const ids = Object.keys(enginesFile.engines).filter((id) => enginesFile.engines[id].enabled !== false);
  return Promise.all(ids.map((id) => probeEngine(id, enginesFile.engines[id], t)));
}

export interface InstalledEngine {
  id: string;
  bin: string;
  installed: boolean;
  binPath: string;        // caminho resolvido, quando instalado
  models: string[];
  default_model: string;
  powers: string[];
  modelPowers: Record<string, string[]>;
  modelsAutoDetected?: boolean;
}

export interface CliDiscoveryResult {
  id: string;
  bin: string;
  installed: boolean;
  binPath: string;
  models: string[];
  powers: string[];
  modelPowers: Record<string, string[]>;
  modelsAutoDetected: boolean;
  source: "known-cli" | "configured-engine";
  detail?: string;
}

interface KnownCliDefinition {
  id: string;
  bin: string;
  models_probe?: EngineConfig["models_probe"];
  fallbackModels?: string[];
  fallbackPowers?: string[];
  fallbackModelPowers?: Record<string, string[]>;
}

const KNOWN_CLIS: KnownCliDefinition[] = [
  {
    id: "claude-code",
    bin: "claude",
    fallbackModels: ["opus", "sonnet", "haiku"],
    fallbackPowers: ["low", "normal", "medium", "high"],
  },
  {
    id: "codex",
    bin: "codex",
    models_probe: {
      command: "grep -hoE 'gpt-[0-9][a-zA-Z0-9.-]*' ~/.codex/.codex-global-state.json ~/.codex/sessions/*/*/*/*.jsonl 2>/dev/null | sort -u",
      parse: "lines",
    },
    fallbackModels: ["gpt-5.5", "gpt-5.4"],
    fallbackPowers: ["low", "normal", "medium", "high"],
  },
  {
    id: "devin-cli",
    bin: "devin",
    models_probe: {
      command: "devin --model x --permission-mode auto -p ping 2>&1 | grep -oE '(claude|gemini|gpt|deepseek|glm|kimi|swe)-[a-z0-9.-]+' | sort -u",
      parse: "lines",
    },
    fallbackModels: ["claude-haiku-4.5", "swe-1.6-fast", "swe-1.5", "gemini-3-flash"],
    fallbackPowers: ["normal", "high"],
  },
  {
    id: "gemini-cli",
    bin: "gemini",
    models_probe: {
      command: "grep -rhoE 'gemini-[0-9.]+-(pro|flash-lite|flash)' ~/.gemini 2>/dev/null | sort -u",
      parse: "lines",
    },
    fallbackModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    fallbackPowers: ["low", "normal", "medium", "high"],
  },
  {
    id: "github-copilot-cli",
    bin: "copilot",
    models_probe: {
      command: "strings ~/.copilot/session-store.db 2>/dev/null | grep -oE '(claude|gpt|gemini)-[a-zA-Z0-9.-]+' | sort -u",
      parse: "lines",
    },
    fallbackModels: ["claude-haiku-4.5", "gpt-5.2", "claude-sonnet-4.5"],
    fallbackPowers: ["normal"],
  },
];

/** Verifica se o bin de um engine existe no PATH local (command -v). */
async function whichBin(bin: string, timeoutSec: number): Promise<string> {
  if (!bin || !bin.trim()) return "";
  const r = await run(`command -v ${bin.split(" ")[0]}`, timeoutSec);
  return r.code === 0 ? r.stdout.trim().split("\n")[0] : "";
}

/** Descobre modelos disponiveis de um engine rodando seu models_probe (best-effort). */
export async function discoverModels(cfg: EngineConfig, timeoutSec: number): Promise<string[]> {
  const mp = cfg.models_probe;
  if (!mp || !mp.command || !mp.command.trim()) return [];
  const r = await run(mp.command, timeoutSec);
  if (r.code !== 0 && !r.stdout) return [];
  if (mp.parse === "json") {
    try {
      const obj = JSON.parse(r.stdout);
      const at = mp.json_path ? jsonPathArray(obj, mp.json_path) : obj;
      return Array.isArray(at) ? normalizeModelCandidates(at.map(String)) : [];
    } catch { return []; }
  }
  // parse "lines": uma linha por modelo, dedup, sem vazios.
  return normalizeModelCandidates(r.stdout.split("\n"));
}

function jsonPathArray(obj: any, expr: string): any {
  if (!expr || !expr.startsWith("$.")) return obj;
  let cur = obj;
  for (const k of expr.slice(2).split(".")) { if (cur == null) return null; cur = cur[k]; }
  return cur;
}

function normalizeModelCandidates(values: string[]): string[] {
  return [...new Set(values
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length <= 80)
    .filter((s) => /^[a-z0-9][a-z0-9._-]*$/i.test(s))
    .filter((s) => !/(prompt|skill|agent|mode|tool)$/i.test(s))
    .filter((s) => !/(prompting|system-prompt|agent-packs)/i.test(s)))];
}

/** Detecta quais engines declarados tem CLI instalado na maquina local + modelos. */
export async function detectInstalled(enginesFile: EnginesFile): Promise<InstalledEngine[]> {
  const t = enginesFile.defaults.probe_timeout_seconds || 10;
  const ids = Object.keys(enginesFile.engines);
  return Promise.all(
    ids
      .filter((id) => enginesFile.engines[id].enabled !== false)
      .map(async (id) => {
      const e = enginesFile.engines[id];
      const binPath = e.location === "local" ? await whichBin(e.bin, t) : "";
      const installed = e.location === "local" ? binPath.length > 0 : true;
      const declared = e.models || [];
      // descoberta automatica: roda models_probe so se instalado; merge com declarados.
      const discovered = installed ? await discoverModels(e, t) : [];
      const models = discovered.length
        ? [...new Set([...discovered, ...declared])]
        : declared;
      const default_model =
        (e.default_model && models.includes(e.default_model)) ? e.default_model : (models[0] ?? "");
      return {
        id,
        bin: e.bin,
        installed,
        binPath,
        models,
        default_model,
        powers: e.powers || ["normal"],
        modelPowers: buildModelPowers(models, e.powers || ["normal"], e.model_powers),
        modelsAutoDetected: discovered.length > 0,
      };
    })
  );
}

function probeConfigFromKnownCli(cli: KnownCliDefinition): EngineConfig {
  return {
    enabled: true,
    location: "local",
    host: "localhost",
    bin: cli.bin,
    input_mode: "arg",
    probe: { command: `${cli.bin} --version`, expect_exit_code: 0 },
    credit_probe: { command: "", parse: "text" },
    models_probe: cli.models_probe,
    exec_template: "",
    models: cli.fallbackModels || [],
    default_model: cli.fallbackModels?.[0] || "",
    powers: cli.fallbackPowers || ["normal"],
    unit: "token",
    best_for: [],
  };
}

function uniqueById(items: CliDiscoveryResult[]): CliDiscoveryResult[] {
  const byId = new Map<string, CliDiscoveryResult>();
  for (const item of items) {
    const cur = byId.get(item.id);
    if (!cur || (!cur.installed && item.installed) || (item.modelsAutoDetected && !cur.modelsAutoDetected)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function inferPowersForModel(model: string, fallback: string[]): string[] {
  const available = fallback.length ? fallback : ["normal"];
  const lower = model.toLowerCase();
  let wanted = available;
  if (/(mini|haiku|flash-lite|fast|lite)/.test(lower)) wanted = ["low", "normal"];
  else if (/(opus|pro|gpt-5\.5|gpt-5\.4|swe-1\.6|sonnet)/.test(lower)) wanted = ["normal", "medium", "high"];
  else if (/(flash|gpt-4o-mini)/.test(lower)) wanted = ["low", "normal", "medium"];
  const filtered = wanted.filter((p) => available.includes(p));
  return filtered.length ? filtered : available;
}

function buildModelPowers(
  models: string[],
  fallbackPowers: string[],
  configured?: Record<string, string[]>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const model of models) {
    const configuredPowers = configured?.[model];
    out[model] = configuredPowers?.length ? configuredPowers : inferPowersForModel(model, fallbackPowers);
  }
  return out;
}

/** Descobre CLIs conhecidos no PATH e tenta listar os modelos disponiveis de cada um. */
export async function discoverInstalledClis(
  timeoutSec = 10,
  enginesFile?: EnginesFile
): Promise<CliDiscoveryResult[]> {
  const configured: KnownCliDefinition[] = enginesFile
    ? Object.entries(enginesFile.engines)
        .filter(([, cfg]) => cfg.enabled !== false && cfg.location === "local")
        .map(([id, cfg]) => ({
          id,
          bin: cfg.bin,
          models_probe: cfg.models_probe,
          fallbackModels: cfg.models || [],
          fallbackPowers: cfg.powers || ["normal"],
          fallbackModelPowers: cfg.model_powers,
        }))
    : [];

  const candidates = [...KNOWN_CLIS, ...configured];
  const found = await Promise.all(candidates.map(async (cli) => {
    const binPath = await whichBin(cli.bin, timeoutSec);
    const installed = binPath.length > 0;
    const cfg = probeConfigFromKnownCli(cli);
    const discovered = installed ? await discoverModels(cfg, timeoutSec) : [];
    const models = discovered.length
      ? [...new Set([...discovered, ...(cli.fallbackModels || [])])]
      : (cli.fallbackModels || []);
    const powers = cli.fallbackPowers || ["normal"];
    return {
      id: cli.id,
      bin: cli.bin,
      installed,
      binPath,
      models,
      powers,
      modelPowers: buildModelPowers(models, powers, cli.fallbackModelPowers),
      modelsAutoDetected: discovered.length > 0,
      source: configured.some((c) => c.id === cli.id && c.bin === cli.bin) ? "configured-engine" as const : "known-cli" as const,
      detail: installed ? undefined : "CLI nao encontrado no PATH",
    };
  }));

  return uniqueById(found);
}

/** Aplica o discovery em memoria para menus, prompt do planner e validacao de plano. */
export function applyCliDiscoveryToEnginesFile(
  enginesFile: EnginesFile,
  discovery: CliDiscoveryResult[]
): EnginesFile {
  const byId = new Map(discovery.map((cli) => [cli.id, cli]));
  const engines: EnginesFile["engines"] = {};
  for (const [id, cfg] of Object.entries(enginesFile.engines)) {
    const cli = byId.get(id);
    if (!cli?.installed) {
      engines[id] = cfg;
      continue;
    }
    const models = cli.models.length ? cli.models : cfg.models;
    const powers = cli.powers.length ? cli.powers : cfg.powers;
    engines[id] = {
      ...cfg,
      models,
      powers,
      model_powers: Object.keys(cli.modelPowers).length ? cli.modelPowers : cfg.model_powers,
      default_model: models.includes(cfg.default_model) ? cfg.default_model : (models[0] || cfg.default_model),
    };
  }
  return { ...enginesFile, engines };
}

/** Engines elegiveis para roteamento: disponiveis e com credito acima do limite. */
export function eligible(
  snaps: EngineSnapshot[],
  minThreshold: number
): EngineSnapshot[] {
  return snaps.filter(
    (s) =>
      s.state === "disponivel" &&
      (s.creditRemaining === null || s.creditRemaining > minThreshold)
  );
}
