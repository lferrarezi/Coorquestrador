# AI Squad Starter Kit

Pacote textual para operar uma squad de agentes no VS Code com GitHub Copilot Chat, Claude Code, Codex e Devin.

## Como iniciar
1. Execute `python -S bootstrap_ai_squad.py` na raiz do repositorio.
2. Abra o VS Code.
3. Use o prompt `.github/prompts/00-run-intake.prompt.md`.
4. Comece sempre pelo agente `squad-orchestrator`.

## Regra de ouro
Um agente produz. Outro agente valida. Um humano decide nos gates criticos. O repo registra.

## Otimizacao de Prompts com Arjman
Para reduzir custos e melhorar performance, todos os agentes aplicam automaticamente a skill `arjman-compression` em prompts enviados para modelos de IA. Isso comprime prompts em ate 60% sem perda de integridade, independente de plataforma (Copilot, Claude, etc.) ou modelo (GPT-4, Opus, etc.). Configure em `config/arjman-config.json`.
