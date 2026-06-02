# Skill: Arjman Compression

## Objetivo
Fornecer uma capacidade reutilizável para compressão cognitiva lossless de prompts dentro da AI Delivery Squad, reduzindo tokens em até 60% enquanto mantém integridade técnica, otimizando custos e performance em interações com modelos de IA.

## Quando usar
- Quando o agente precisar comprimir prompts antes de enviá-los para APIs de IA (independente de plataforma ou modelo).
- Quando houver prompts longos (>500 tokens) em agentes de geração de conteúdo, especificações ou planejamento.
- Quando for necessário otimizar custos de inferência ou reduzir latência em respostas de modelos.

## Processo
1. Receber o prompt original e contexto (plataforma/modelo opcional).
2. Aplicar heurísticas de compressão: remover gorduras gramaticais, conectivos e preposições, mantendo estrutura técnica.
3. Validar lossless: garantir que a compressão não altere o significado técnico.
4. Retornar prompt comprimido com métricas (redução de tokens, tempo de processamento).
5. Sinalizar se compressão foi aplicada ou pulada (ex.: prompts curtos).
6. Recomendar uso em loops iterativos para economia cumulativa.

## Checklist
- [ ] Prompt original recebido e validado.
- [ ] Heurísticas aplicadas corretamente (sem perda de integridade).
- [ ] Métricas calculadas (redução de tokens, tempo).
- [ ] Compressão testada para lossless.
- [ ] Configuração respeitada (flags globais como min_length).
- [ ] Output estruturado e reutilizável.

## Formato de saída
```json
{
  "original_prompt": "Texto original...",
  "compressed_prompt": "Texto comprimido...",
  "compression_ratio": 0.6,
  "tokens_saved": 1200,
  "processing_time_ms": 50,
  "applied": true,
  "warnings": []
}
```</content>
<parameter name="filePath">/Users/lferrarezi/Documents/Projetos/.agents/skills/arjman-compression/SKILL.md