// src/core/types.ts
// Tipos compartilhados do nucleo do Coorquestrador.

export type EngineState =
  | "disponivel"
  | "sem-credito"
  | "offline"
  | "nao-autenticado";

export interface EngineConfig {
  enabled: boolean;
  location: "local" | "servidor";
  host: string;
  bin: string;
  input_mode: "arg" | "stdin" | "file";
  probe: { command: string; expect_exit_code: number };
  credit_probe: { command: string; parse: "json" | "text"; json_path?: string };
  // descoberta automatica de modelos (opcional): roda o comando e extrai a lista.
  models_probe?: { command: string; parse: "lines" | "json"; json_path?: string };
  exec_template: string;
  models: string[];
  default_model: string;
  powers: string[];
  unit: "token" | "acu";
  best_for: string[];
}

export interface EngineSnapshot {
  id: string;
  state: EngineState;
  creditRemaining: number | null; // fracao 0..1 quando conhecida, ou valor absoluto
  probedAt: string;               // ISO timestamp
  detail: string;
}

export type TaskSize = "trivial" | "small" | "medium" | "large" | "xlarge";
export type Criticality = "baixa" | "normal" | "alta" | "critica";
export type TaskStatus =
  | "planejada"
  | "bloqueada"
  | "aprovada"
  | "executando"
  | "revisao"
  | "concluida"
  | "rejeitada";

export interface Task {
  id: string;
  activity: string;
  description: string;
  size: TaskSize;
  criticality: Criticality;
  dependsOn: string[];
  acceptance: string;
  // preenchido pelo roteamento:
  engine?: string;
  model?: string;
  power?: string;
  // custo:
  estimatedCost?: number;
  realCost?: number;
  // execucao:
  status: TaskStatus;
  command?: string;
  specFile?: string;
  artifacts?: string[];
  log?: string;
}

export interface Demand {
  id: string;
  project: string;        // subpasta da raiz multiprojetos
  title: string;
  description: string;
  createdAt: string;
  status: "nova" | "planejada" | "aguardando-gate1" | "em-execucao" | "concluida" | "bloqueada";
  tasks: Task[];
  estimatedTotal?: number;
  realTotal?: number;
}

export interface DemandStoreShape {
  version: number;
  demands: Demand[];
}
