// src/core/prober.ts
// Probe hibrido: a config declara os engines; aqui validamos em runtime.

import { exec } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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

export interface ProbeOptions {
  /** Reusa snapshots recentes (default 60s). 0 desativa o cache. */
  cacheTtlMs?: number;
  /** Ignora o cache e re-executa todos os probes (ex.: comando manual). */
  force?: boolean;
}

const DEFAULT_PROBE_TTL_MS = 60_000;
let probeCache: { key: string; at: number; snaps: EngineSnapshot[] } | null = null;

function probeCacheKey(enginesFile: EnginesFile, ids: string[]): string {
  return ids.map((id) => {
    const e = enginesFile.engines[id];
    return `${id}|${e.probe?.command || ""}|${e.credit_probe?.command || ""}`;
  }).join("\n");
}

/** Limpa o cache de probes (testes / pos-edicao de engines.yaml). */
export function invalidateProbeCache() { probeCache = null; }

export async function probeAll(enginesFile: EnginesFile, opts: ProbeOptions = {}): Promise<EngineSnapshot[]> {
  const t = enginesFile.defaults.probe_timeout_seconds;
  const ids = Object.keys(enginesFile.engines).filter((id) => enginesFile.engines[id].enabled !== false);
  const ttl = opts.cacheTtlMs ?? DEFAULT_PROBE_TTL_MS;
  const key = probeCacheKey(enginesFile, ids);

  if (!opts.force && ttl > 0 && probeCache && probeCache.key === key && Date.now() - probeCache.at < ttl) {
    return probeCache.snaps;
  }

  const snaps = await Promise.all(ids.map((id) => probeEngine(id, enginesFile.engines[id], t)));
  probeCache = { key, at: Date.now(), snaps };
  return snaps;
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
      command: "",
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

function pathEnv(env: NodeJS.ProcessEnv): string {
  return env.PATH || env.Path || env.path || "";
}

function pathDelimiter(platform = process.platform): string {
  return platform === "win32" ? ";" : path.delimiter;
}

function executableExtensions(env: NodeJS.ProcessEnv, platform = process.platform): string[] {
  if (platform !== "win32") return [""];
  const pathext = env.PATHEXT || ".COM;.EXE;.BAT;.CMD;.PS1";
  return ["", ...pathext.split(";").map((e) => e.trim().toLowerCase()).filter(Boolean)];
}

function candidateDirs(env: NodeJS.ProcessEnv, platform = process.platform): string[] {
  const dirs = pathEnv(env).split(pathDelimiter(platform)).filter(Boolean);
  if (platform === "win32") {
    const appData = env.APPDATA;
    const localAppData = env.LOCALAPPDATA;
    const userProfile = env.USERPROFILE || env.HOME;
    const programData = env.ProgramData || "C:\\ProgramData";
    if (appData) dirs.push(path.join(appData, "npm"));
    if (appData) dirs.push(path.join(appData, "npm", "node_modules", ".bin"));
    if (localAppData) dirs.push(path.join(localAppData, "pnpm"));
    if (userProfile) dirs.push(path.join(userProfile, ".local", "bin"));
    if (userProfile) dirs.push(path.join(userProfile, "scoop", "shims"));
    if (programData) dirs.push(path.join(programData, "chocolatey", "bin"));
  }
  return [...new Set(dirs)];
}

/** Resolve um CLI no PATH sem depender de `command -v`, para funcionar no Windows. */
export function resolveBinPath(
  bin: string,
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform
): string {
  if (!bin || !bin.trim()) return "";
  const exe = bin.trim().split(/\s+/)[0];
  if (!exe) return "";
  if (path.isAbsolute(exe) && fs.existsSync(exe)) return exe;
  const dirs = candidateDirs(env, platform);
  const exts = executableExtensions(env, platform);
  const hasExt = path.extname(exe).length > 0;
  for (const dir of dirs) {
    const candidates = hasExt ? [path.join(dir, exe)] : exts.map((ext) => path.join(dir, exe + ext));
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "";
}

/** Verifica se o bin de um engine existe no PATH local. */
async function whichBin(bin: string, timeoutSec: number): Promise<string> {
  const resolved = resolveBinPath(bin);
  if (resolved) return resolved;
  const exe = bin.trim().split(/\s+/)[0];
  if (process.platform === "win32" && /^[a-zA-Z0-9_.-]+$/.test(exe)) {
    const r = await run(`where ${exe}`, timeoutSec);
    if (r.code === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  }
  return "";
}

/** Descobre modelos disponiveis de um engine rodando seu models_probe (best-effort). */
export async function discoverModels(cfg: EngineConfig, timeoutSec: number): Promise<string[]> {
  if (cfg.bin.toLowerCase().includes("gemini")) return [];
  const mp = cfg.models_probe;
  if (!mp || !mp.command || !mp.command.trim()) return discoverModelsFromLocalState(cfg.bin);
  const r = await run(mp.command, timeoutSec);
  if (r.code !== 0 && !r.stdout) return discoverModelsFromLocalState(cfg.bin);
  if (mp.parse === "json") {
    try {
      const obj = JSON.parse(r.stdout);
      const at = mp.json_path ? jsonPathArray(obj, mp.json_path) : obj;
      return Array.isArray(at) ? normalizeModelCandidates(at.map(String)) : [];
    } catch { return discoverModelsFromLocalState(cfg.bin); }
  }
  // parse "lines": uma linha por modelo, dedup, sem vazios.
  const parsed = normalizeModelCandidates(r.stdout.split("\n"));
  return parsed.length ? parsed : discoverModelsFromLocalState(cfg.bin);
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

function walkFiles(dir: string, maxFiles = 200): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length && out.length < maxFiles) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else out.push(p);
      if (out.length >= maxFiles) break;
    }
  }
  return out;
}

function readTextBestEffort(file: string, maxBytes = 512 * 1024): string {
  try {
    const stat = fs.statSync(file);
    if (stat.size > maxBytes * 4) return "";
    const buf = fs.readFileSync(file);
    return buf.subarray(0, maxBytes).toString("utf8");
  } catch { return ""; }
}

function extractModelsFromFiles(files: string[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const file of files) {
    const text = readTextBestEffort(file);
    for (const match of text.matchAll(pattern)) found.push(match[0]);
  }
  return normalizeModelCandidates(found);
}

function discoverModelsFromLocalState(bin: string): string[] {
  const home = os.homedir();
  const normalized = bin.toLowerCase();
  if (normalized.includes("codex")) {
    const root = path.join(home, ".codex");
    const files = [
      path.join(root, ".codex-global-state.json"),
      ...walkFiles(path.join(root, "sessions"), 300).filter((f) => f.endsWith(".jsonl") || f.endsWith(".json")),
    ];
    return extractModelsFromFiles(files, /gpt-[0-9][a-zA-Z0-9.-]*/g);
  }
  if (normalized.includes("gemini")) return [];
  if (normalized.includes("copilot")) {
    return extractModelsFromFiles(walkFiles(path.join(home, ".copilot"), 80), /(?:claude|gpt|gemini)-[a-zA-Z0-9.-]+/g);
  }
  return [];
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
        ? [...new Set([...declared, ...discovered])]
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
      ? [...new Set([...(cli.fallbackModels || []), ...discovered])]
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
