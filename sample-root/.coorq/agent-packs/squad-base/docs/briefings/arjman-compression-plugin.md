# Arjman Compression Plugin

## 1. Visão Geral
O **Arjman Compression Plugin** é uma Extensão de Navegador multiplataforma (Chrome/Edge) que tem como objetivo interceptar prompts de usuários inseridos nas interfaces oficiais do ChatGPT, Claude e Gemini. Ele aplica uma heurística de tradução de linguagem natural para uma linguagem primitiva e direta ("Arjman Style"), compactando o volume de tokens (30% a 50%) e preservando a precisão cognitiva do modelo de destino (*Lossless Cognitive*).

## 2. Objetivo de Negócio e de Produto
- **Redução de Custo de Tokens:** Viabilizar uso intensivo de LLMs, reduzindo drasticamente o consumo de context window.
- **Eficiência Computacional:** Textos menores reduzem a latência TTFT (Time to First Token).
- **Sem Perda Semântica:** Provar que a linguagem limpa de adereços gera as mesmas saídas inteligentes e completas dos modelos originais.

## 3. Público-Alvo
- **Engenheiros de Prompt:** Profissionais que gerenciam milhares de tokens de contexto.
- **Power Users de IA:** Usuários assinantes que atingem facilmente o limite horário (ex: limites de mensagens no Claude 3.5 Sonnet / GPT-4o).
- **Agentes Autônomos (Uso API):** Como produto paralelo no futuro, oferecer a compressão como *middleware proxy* local.

## 4. Escopo do MVP (Browser Extension)
- Suporte a pelo menos um LLM interface Web nativa (ex: ChatGPT).
- Motor de Tradução Arjman configurável: O usuário insere uma chave de API própria (ex: Groq, Llama local ou OpenAI mini) para realizar a tradução rápida `User Prompt -> Arjman` antes da injeção do prompt final.
- **Output Style Injection:** O plugin anexa automaticamente ao fim do prompt primitivo a instrução mandatória: `"Output: respond normally, with professional tone, high detail and full sentences"`, garantindo que o LLM alvo não devolva respostas em linguagem primitiva.
- Botão "Arjmanize": Um switch visual dentro da caixa de texto do LLM (textarea) que o usuário aciona para compactar a mensagem antes do "Send".

## 5. Requisitos Não Funcionais (NFRs) e Riscos
- **Privacidade (P0):** O processamento da tradução deve ser transparente. Se utilizar a nuvem, o usuário precisa estar 100% ciente que o texto original está sendo processado por uma API (Groq/OpenAI) via chave própria. Idealmente evoluir para WebGPU/Local WASM.
- **Perda Semântica (P0):** O prompt comprimido não pode suprimir *constraints*, *personas* (Roles) e variáveis chave da tarefa.
- **Resiliência de DOM:** A extensão deve ser imune ou facilmente adaptável a mudanças nas interfaces das web apps suportadas.

## 6. Critérios de Aceite
1. O plugin consegue injetar um botão funcional na interface oficial de pelo menos uma IA (ChatGPT).
2. O prompt submetido gera economia documentada e superior a 30% em tokens.
3. O framework de prompt interno traduz o texto perfeitamente para "Arjman", reduzindo fillers sem excluir o foco da instrução.
4. O *Lossless Score* deve atestar >= 95% de assertividade comparado ao prompt original.
