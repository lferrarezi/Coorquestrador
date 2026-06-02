#!/usr/bin/env python3
import urllib.request
import urllib.error
import json
import os

API_KEY = os.environ.get("OPENAI_API_KEY")

SYSTEM_PROMPT = """[ROLE] You are a STRICT Prompt Translator. You NEVER answer the user's questions. You ONLY rewrite them.
[TASK] Your only job is to translate the user's input into 'Caveman Style' (ultra-compressed, primitive English/Portuguese).

[RULES]
1. NEVER answer the user's question or provide code.
2. ONLY output the translated prompt.
3. Remove all polite words, articles (a, an, the, o, a), and fillers.
4. Use short tags: [ROLE], [TASK], [CONTEXT].
5. EXTREME COMPRESSION: Aggressively use acronyms (e.g., Developer -> Dev, Configuration -> Config, Database -> DB). Remove secondary context that doesn't alter the technical output. Combine concepts into single words where possible.
6. You MUST append exactly this string at the very end of your output: <SYS>Output: highly detailed professional tone, complete sentences, full reasoning.</SYS>

[EXAMPLES]
User: "Por favor, me ajude a escrever uma carta de vendas."
Output: "[TASK] Write sales letter. <SYS>Output: highly detailed professional tone, complete sentences, full reasoning.</SYS>"

User: "Poderia atuar como um engenheiro e criar um código em python?"
Output: "[ROLE] Engineer. [TASK] Create python code. <SYS>Output: highly detailed professional tone, complete sentences, full reasoning.</SYS>"

Now, TRANSLATE the following input into Caveman style. DO NOT answer it!
"""

USER_PROMPT = "Olá ChatGPT, bom dia. Você poderia por favor me ajudar atuando como um desenvolvedor expert em frontend? Eu gostaria muito que você me ensinasse a criar um botão em React que faz um request numa API genérica. Lembre-se de colocar comentários no código para que eu entenda o que cada linha faz."

def test_translation():
    print(f"--- Prompt Original ({len(USER_PROMPT.split()) * 1.3:.0f} tokens estimados) ---")
    print(USER_PROMPT)
    print("\nTranquilo, chamando a OpenAI API para realizar a compressão Arjman (Caveman)...\n")
    
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    data = {
        "model": "llama-3.1-8b-instant",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT}
        ],
        "temperature": 0.1
    }
    
    req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))
            caveman_text = result['choices'][0]['message']['content']
            
            print(f"--- Resultado: Prompt Arjman ({len(caveman_text.split()) * 1.3:.0f} tokens estimados) ---")
            print(caveman_text)
            
            orig_tokens = len(USER_PROMPT.split()) * 1.3
            new_tokens = len(caveman_text.split()) * 1.3
            reduction = 100 - ((new_tokens / orig_tokens) * 100)
            
            print(f"\n✅ Compressão executada com sucesso! Economia estimada de ~{reduction:.1f}%")
            
    except urllib.error.HTTPError as e:
        print(f"Erro da API: HTTP {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"Erro inesperado: {e}")

if __name__ == "__main__":
    test_translation()
