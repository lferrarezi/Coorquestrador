"use strict";
// src/core/prober.ts
// Probe hibrido: a config declara os engines; aqui validamos em runtime.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.probeEngine = probeEngine;
exports.probeAll = probeAll;
exports.resolveBinPath = resolveBinPath;
exports.discoverModels = discoverModels;
exports.detectInstalled = detectInstalled;
exports.discoverInstalledClis = discoverInstalledClis;
exports.applyCliDiscoveryToEnginesFile = applyCliDiscoveryToEnginesFile;
exports.eligible = eligible;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
function run(cmd, timeoutSec) {
    return new Promise((resolve) => {
        if (!cmd || !cmd.trim()) {
            resolve({ code: -1, stdout: "", stderr: "no-command" });
            return;
        }
        (0, child_process_1.exec)(cmd, { timeout: timeoutSec * 1000 }, (err, stdout, stderr) => {
            const code = err && typeof err.code === "number" ? err.code : err ? 1 : 0;
            resolve({ code, stdout: stdout || "", stderr: stderr || "" });
        });
    });
}
function jsonPath(obj, expr) {
    // suporte minimo a "$.a.b.c"
    if (!expr || !expr.startsWith("$."))
        return null;
    const keys = expr.slice(2).split(".");
    let cur = obj;
    for (const k of keys) {
        if (cur == null)
            return null;
        cur = cur[k];
    }
    return typeof cur === "number" ? cur : null;
}
async function probeEngine(id, cfg, timeoutSec) {
    const now = new Date().toISOString();
    if (!cfg.enabled) {
        return { id, state: "offline", creditRemaining: null, probedAt: now, detail: "desabilitado na config" };
    }
    // 1) disponibilidade + autenticacao
    const av = await run(cfg.probe.command, timeoutSec);
    let state;
    let detail = "";
    if (av.code === cfg.probe.expect_exit_code) {
        state = "disponivel";
    }
    else if (/auth|login|unauthorized|nao.?autenticado/i.test(av.stderr + av.stdout)) {
        state = "nao-autenticado";
        detail = "probe indicou falta de autenticacao";
    }
    else {
        state = "offline";
        detail = `probe falhou (exit ${av.code}) ${av.stderr.slice(0, 120)}`;
    }
    // 2) credito (se houver credit_probe)
    let creditRemaining = null;
    if (state === "disponivel" && cfg.credit_probe?.command) {
        const cr = await run(cfg.credit_probe.command, timeoutSec);
        if (cr.code === 0) {
            if (cfg.credit_probe.parse === "json") {
                try {
                    const obj = JSON.parse(cr.stdout);
                    creditRemaining = jsonPath(obj, cfg.credit_probe.json_path || "");
                }
                catch { /* ignore */ }
            }
            else {
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
async function probeAll(enginesFile) {
    const t = enginesFile.defaults.probe_timeout_seconds;
    const ids = Object.keys(enginesFile.engines).filter((id) => enginesFile.engines[id].enabled !== false);
    return Promise.all(ids.map((id) => probeEngine(id, enginesFile.engines[id], t)));
}
const KNOWN_CLIS = [
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
function pathEnv(env) {
    return env.PATH || env.Path || env.path || "";
}
function pathDelimiter(platform = process.platform) {
    return platform === "win32" ? ";" : path.delimiter;
}
function executableExtensions(env, platform = process.platform) {
    if (platform !== "win32")
        return [""];
    const pathext = env.PATHEXT || ".COM;.EXE;.BAT;.CMD;.PS1";
    return ["", ...pathext.split(";").map((e) => e.trim().toLowerCase()).filter(Boolean)];
}
function candidateDirs(env, platform = process.platform) {
    const dirs = pathEnv(env).split(pathDelimiter(platform)).filter(Boolean);
    if (platform === "win32") {
        const appData = env.APPDATA;
        const localAppData = env.LOCALAPPDATA;
        const userProfile = env.USERPROFILE || env.HOME;
        const programData = env.ProgramData || "C:\\ProgramData";
        if (appData)
            dirs.push(path.join(appData, "npm"));
        if (appData)
            dirs.push(path.join(appData, "npm", "node_modules", ".bin"));
        if (localAppData)
            dirs.push(path.join(localAppData, "pnpm"));
        if (userProfile)
            dirs.push(path.join(userProfile, ".local", "bin"));
        if (userProfile)
            dirs.push(path.join(userProfile, "scoop", "shims"));
        if (programData)
            dirs.push(path.join(programData, "chocolatey", "bin"));
    }
    return [...new Set(dirs)];
}
/** Resolve um CLI no PATH sem depender de `command -v`, para funcionar no Windows. */
function resolveBinPath(bin, env = process.env, platform = process.platform) {
    if (!bin || !bin.trim())
        return "";
    const exe = bin.trim().split(/\s+/)[0];
    if (!exe)
        return "";
    if (path.isAbsolute(exe) && fs.existsSync(exe))
        return exe;
    const dirs = candidateDirs(env, platform);
    const exts = executableExtensions(env, platform);
    const hasExt = path.extname(exe).length > 0;
    for (const dir of dirs) {
        const candidates = hasExt ? [path.join(dir, exe)] : exts.map((ext) => path.join(dir, exe + ext));
        for (const candidate of candidates) {
            if (fs.existsSync(candidate))
                return candidate;
        }
    }
    return "";
}
/** Verifica se o bin de um engine existe no PATH local. */
async function whichBin(bin, timeoutSec) {
    const resolved = resolveBinPath(bin);
    if (resolved)
        return resolved;
    const exe = bin.trim().split(/\s+/)[0];
    if (process.platform === "win32" && /^[a-zA-Z0-9_.-]+$/.test(exe)) {
        const r = await run(`where ${exe}`, timeoutSec);
        if (r.code === 0 && r.stdout.trim())
            return r.stdout.trim().split(/\r?\n/)[0];
    }
    return "";
}
/** Descobre modelos disponiveis de um engine rodando seu models_probe (best-effort). */
async function discoverModels(cfg, timeoutSec) {
    if (cfg.bin.toLowerCase().includes("gemini"))
        return [];
    const mp = cfg.models_probe;
    if (!mp || !mp.command || !mp.command.trim())
        return discoverModelsFromLocalState(cfg.bin);
    const r = await run(mp.command, timeoutSec);
    if (r.code !== 0 && !r.stdout)
        return discoverModelsFromLocalState(cfg.bin);
    if (mp.parse === "json") {
        try {
            const obj = JSON.parse(r.stdout);
            const at = mp.json_path ? jsonPathArray(obj, mp.json_path) : obj;
            return Array.isArray(at) ? normalizeModelCandidates(at.map(String)) : [];
        }
        catch {
            return discoverModelsFromLocalState(cfg.bin);
        }
    }
    // parse "lines": uma linha por modelo, dedup, sem vazios.
    const parsed = normalizeModelCandidates(r.stdout.split("\n"));
    return parsed.length ? parsed : discoverModelsFromLocalState(cfg.bin);
}
function jsonPathArray(obj, expr) {
    if (!expr || !expr.startsWith("$."))
        return obj;
    let cur = obj;
    for (const k of expr.slice(2).split(".")) {
        if (cur == null)
            return null;
        cur = cur[k];
    }
    return cur;
}
function normalizeModelCandidates(values) {
    return [...new Set(values
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((s) => s.length <= 80)
            .filter((s) => /^[a-z0-9][a-z0-9._-]*$/i.test(s))
            .filter((s) => !/(prompt|skill|agent|mode|tool)$/i.test(s))
            .filter((s) => !/(prompting|system-prompt|agent-packs)/i.test(s)))];
}
function walkFiles(dir, maxFiles = 200) {
    const out = [];
    const stack = [dir];
    while (stack.length && out.length < maxFiles) {
        const cur = stack.pop();
        let entries = [];
        try {
            entries = fs.readdirSync(cur, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const p = path.join(cur, entry.name);
            if (entry.isDirectory())
                stack.push(p);
            else
                out.push(p);
            if (out.length >= maxFiles)
                break;
        }
    }
    return out;
}
function readTextBestEffort(file, maxBytes = 512 * 1024) {
    try {
        const stat = fs.statSync(file);
        if (stat.size > maxBytes * 4)
            return "";
        const buf = fs.readFileSync(file);
        return buf.subarray(0, maxBytes).toString("utf8");
    }
    catch {
        return "";
    }
}
function extractModelsFromFiles(files, pattern) {
    const found = [];
    for (const file of files) {
        const text = readTextBestEffort(file);
        for (const match of text.matchAll(pattern))
            found.push(match[0]);
    }
    return normalizeModelCandidates(found);
}
function discoverModelsFromLocalState(bin) {
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
    if (normalized.includes("gemini"))
        return [];
    if (normalized.includes("copilot")) {
        return extractModelsFromFiles(walkFiles(path.join(home, ".copilot"), 80), /(?:claude|gpt|gemini)-[a-zA-Z0-9.-]+/g);
    }
    return [];
}
/** Detecta quais engines declarados tem CLI instalado na maquina local + modelos. */
async function detectInstalled(enginesFile) {
    const t = enginesFile.defaults.probe_timeout_seconds || 10;
    const ids = Object.keys(enginesFile.engines);
    return Promise.all(ids
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
        const default_model = (e.default_model && models.includes(e.default_model)) ? e.default_model : (models[0] ?? "");
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
    }));
}
function probeConfigFromKnownCli(cli) {
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
function uniqueById(items) {
    const byId = new Map();
    for (const item of items) {
        const cur = byId.get(item.id);
        if (!cur || (!cur.installed && item.installed) || (item.modelsAutoDetected && !cur.modelsAutoDetected)) {
            byId.set(item.id, item);
        }
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
function inferPowersForModel(model, fallback) {
    const available = fallback.length ? fallback : ["normal"];
    const lower = model.toLowerCase();
    let wanted = available;
    if (/(mini|haiku|flash-lite|fast|lite)/.test(lower))
        wanted = ["low", "normal"];
    else if (/(opus|pro|gpt-5\.5|gpt-5\.4|swe-1\.6|sonnet)/.test(lower))
        wanted = ["normal", "medium", "high"];
    else if (/(flash|gpt-4o-mini)/.test(lower))
        wanted = ["low", "normal", "medium"];
    const filtered = wanted.filter((p) => available.includes(p));
    return filtered.length ? filtered : available;
}
function buildModelPowers(models, fallbackPowers, configured) {
    const out = {};
    for (const model of models) {
        const configuredPowers = configured?.[model];
        out[model] = configuredPowers?.length ? configuredPowers : inferPowersForModel(model, fallbackPowers);
    }
    return out;
}
/** Descobre CLIs conhecidos no PATH e tenta listar os modelos disponiveis de cada um. */
async function discoverInstalledClis(timeoutSec = 10, enginesFile) {
    const configured = enginesFile
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
            source: configured.some((c) => c.id === cli.id && c.bin === cli.bin) ? "configured-engine" : "known-cli",
            detail: installed ? undefined : "CLI nao encontrado no PATH",
        };
    }));
    return uniqueById(found);
}
/** Aplica o discovery em memoria para menus, prompt do planner e validacao de plano. */
function applyCliDiscoveryToEnginesFile(enginesFile, discovery) {
    const byId = new Map(discovery.map((cli) => [cli.id, cli]));
    const engines = {};
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
function eligible(snaps, minThreshold) {
    return snaps.filter((s) => s.state === "disponivel" &&
        (s.creditRemaining === null || s.creditRemaining > minThreshold));
}
//# sourceMappingURL=prober.js.map