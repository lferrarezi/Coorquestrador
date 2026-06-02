#!/usr/bin/env bash
set -e
[ -f AGENTS.md ]
[ -f SQUAD.md ]
[ -f .agents/00-squad-orchestrator.agent.md ]
[ -f .agents/prompts/00-run-intake.prompt.md ]
[ -f .agents/specify/memory/constitution.md ]
count=$(find .agents -type f -name '*.agent.md' | wc -l | tr -d ' ')
echo "AI Squad package OK. Agent files: $count"
