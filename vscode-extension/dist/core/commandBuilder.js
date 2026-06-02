"use strict";
// src/core/commandBuilder.ts
// Monta o comando CLI concreto de uma tarefa a partir do exec_template do engine.
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
exports.buildCommand = buildCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** Escapa um prompt para uso seguro como argumento de shell. */
function shellQuote(s) {
    return `'${s.replace(/'/g, `'\\''`)}'`;
}
/**
 * Constroi o comando para uma tarefa.
 * @param task tarefa ja roteada (engine/model/power definidos)
 * @param cfg config do engine escolhido
 * @param sddPrompt prompt + spec (padrao SDD) ja compilado
 * @param cwd diretorio do projeto-alvo
 * @param specDir onde gravar specs quando input_mode=file
 */
function buildCommand(task, cfg, sddPrompt, cwd, specDir) {
    let specFile;
    let promptForTemplate = sddPrompt;
    if (cfg.input_mode === "file") {
        fs.mkdirSync(specDir, { recursive: true });
        specFile = path.join(specDir, `${task.id}.spec.md`);
        fs.writeFileSync(specFile, sddPrompt, "utf8");
        promptForTemplate = ""; // o template usa {spec_file}
    }
    let command = cfg.exec_template
        .replace("{model}", task.model || cfg.default_model)
        .replace("{power}", task.power || "normal")
        .replace("{cwd}", cwd)
        .replace("{spec_file}", specFile ? shellQuote(specFile) : "")
        .replace("{prompt}", cfg.input_mode === "arg" ? shellQuote(promptForTemplate) : "");
    // input_mode=stdin: o template nao deve consumir {prompt}; mandamos via stdin
    if (cfg.input_mode === "stdin") {
        command = command.replace("{prompt}", "").trim();
    }
    return {
        command: command.trim(),
        specFile,
        inputMode: cfg.input_mode,
        stdinPayload: cfg.input_mode === "stdin" ? sddPrompt : undefined,
    };
}
//# sourceMappingURL=commandBuilder.js.map