#!/usr/bin/env python3
"""
Arjman Compression Benchmark

Este script serve como a bancada de testes para validar a economia de tokens
e a manutenção da qualidade cognitiva (Lossless) do prompt convertido.

Uso:
  python3 scripts/arjman_benchmark.py
"""

import json

# Exemplo de dataset
DATASET = [
    {
        "id": "001",
        "original": "Você poderia por favor atuar como um engenheiro de software experiente e escrever um script em Python que se conecta a um banco de dados PostgreSQL e busca todos os usuários inativos nos últimos 30 dias? Certifique-se de tratar erros de conexão e adicionar comentários explicando o código.",
        "arjman": "[ROLE] Expert Dev. [TASK] Python script connect PostgreSQL, fetch inactive users last 30 days. [CONSTRAINTS] Handle connection errors. Add code comments. <SYS>Output: highly detailed professional tone, complete sentences, full reasoning.</SYS>"
    }
]

def estimate_tokens(text):
    # Estimativa simples: 1 token ~ 4 chars (em ingles/geral) ou usar tiktoken se disponivel
    try:
        import tiktoken
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except ImportError:
        return len(text.split()) * 1.3 # Heuristica simples se tiktoken nao instalado

def run_benchmark():
    print("=== Inciando Benchmark Arjman ===")
    total_original = 0
    total_arjman = 0
    
    for item in DATASET:
        t_orig = estimate_tokens(item["original"])
        t_cave = estimate_tokens(item["arjman"])
        total_original += t_orig
        total_arjman += t_cave
        
        reduction = 100 - ((t_cave / t_orig) * 100) if t_orig > 0 else 0
        
        print(f"\nID: {item['id']}")
        print(f"Original: {t_orig:.0f} tokens")
        print(f"Arjman:  {t_cave:.0f} tokens")
        print(f"Redução:  {reduction:.1f}%")
        
    print("\n=== Resultado Final ===")
    if total_original > 0:
        total_reduction = 100 - ((total_arjman / total_original) * 100)
        print(f"Economia total de tokens: {total_reduction:.1f}%")
        if total_reduction >= 30:
            print("STATUS: PASSOU (A compressão excedeu 30%)")
        else:
            print("STATUS: FALHOU (A compressão não atingiu 30%)")
            
    print("\nPRÓXIMA ETAPA MANUAL: ")
    print("Envie o prompt Original e o Arjman para um LLM (ex: GPT-4 ou Claude 3.5 Sonnet).")
    print("Avalie se a resposta gerada pelo prompt Arjman manteve o 'Lossless Score' >= 95%.")

if __name__ == "__main__":
    run_benchmark()
