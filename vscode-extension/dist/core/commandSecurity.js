"use strict";
// src/core/commandSecurity.ts
// Validacao e redacao para comandos shell configurados por engine.
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
exports.validateExecTemplate = validateExecTemplate;
exports.assertValidExecTemplate = assertValidExecTemplate;
exports.sanitizeTemplateValue = sanitizeTemplateValue;
exports.ensureInsideDir = ensureInsideDir;
exports.redactSecrets = redactSecrets;
exports.redactCommand = redactCommand;
const path = __importStar(require("path"));
const ALLOWED_PLACEHOLDERS = new Set(["model", "power", "prompt", "spec_file", "cwd"]);
const SAFE_ARG = /^[a-zA-Z0-9._:@/+,-]+$/;
const SECRET_PATTERNS = [
    /(sk-[a-zA-Z0-9_-]{12,})/g,
    /(sb_[a-zA-Z0-9_-]{12,})/g,
    /([A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD)[A-Z0-9_]*=)([^\s'"]+)/gi,
    /(Bearer\s+)([a-zA-Z0-9._-]+)/gi,
];
function validateExecTemplate(cfg, engineId = "engine") {
    const errors = [];
    if (!cfg.exec_template || !cfg.exec_template.trim())
        errors.push(`${engineId}: exec_template vazio.`);
    if (!["arg", "stdin", "file"].includes(cfg.input_mode))
        errors.push(`${engineId}: input_mode invalido.`);
    const placeholders = [...(cfg.exec_template || "").matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    for (const p of placeholders) {
        if (!ALLOWED_PLACEHOLDERS.has(p))
            errors.push(`${engineId}: placeholder desconhecido {${p}}.`);
    }
    if (cfg.input_mode === "arg" && !placeholders.includes("prompt")) {
        errors.push(`${engineId}: input_mode=arg exige {prompt} no exec_template.`);
    }
    if (cfg.input_mode === "file" && !placeholders.includes("spec_file")) {
        errors.push(`${engineId}: input_mode=file exige {spec_file} no exec_template.`);
    }
    return errors;
}
function assertValidExecTemplate(cfg, engineId = "engine") {
    const errors = validateExecTemplate(cfg, engineId);
    if (errors.length)
        throw new Error(errors.join(" "));
}
function sanitizeTemplateValue(value, field) {
    if (!value || !SAFE_ARG.test(value)) {
        throw new Error(`${field} contem caracteres nao permitidos para comando shell.`);
    }
    return value;
}
function ensureInsideDir(file, dir) {
    const absFile = path.resolve(file);
    const absDir = path.resolve(dir);
    const rel = path.relative(absDir, absFile);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`Caminho fora do diretorio permitido: ${file}`);
    }
    return absFile;
}
function redactSecrets(input) {
    let out = input;
    for (const pattern of SECRET_PATTERNS) {
        out = out.replace(pattern, (...args) => {
            if (args.length >= 4 && typeof args[1] === "string" && typeof args[2] === "string") {
                return `${args[1]}[REDACTED]`;
            }
            return "[REDACTED]";
        });
    }
    return out;
}
function redactCommand(command) {
    let out = redactSecrets(command);
    out = out.replace(/(--(?:prompt|task)\s+)'[^']*'/gi, "$1'[REDACTED]'");
    return out.length > 800 ? `${out.slice(0, 800)}...` : out;
}
//# sourceMappingURL=commandSecurity.js.map