#!/usr/bin/env python3
"""
Radar diario de licitacoes (PNCP) para Crateus + regiao dos Inhamuns (CE).
Filtra editais cujo objeto sugere compra de material de construcao, para a
Nobre Lar avaliar participacao como fornecedora.

Consulta a API publica do PNCP diretamente (mesma fonte de dados que o
MCP @licinexusbr/mcp encapsula) para nao depender de manter um processo de
servidor MCP vivo so para um job em lote diario.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = SKILL_DIR / "config"
DATA_DIR = SKILL_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

PNCP_BASE = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"
USER_AGENT = "nobrelar-radar-licitacoes/1.0"

# Pregao eletronico, Pregao presencial, Concorrencia eletronica, Dispensa, Inexigibilidade
MODALIDADES = [6, 7, 4, 8, 9]

MODALIDADE_NOMES = {
    1: "Leilão - Eletrônico",
    2: "Diálogo Competitivo",
    3: "Concurso",
    4: "Concorrência - Eletrônica",
    5: "Concorrência - Presencial",
    6: "Pregão - Eletrônico",
    7: "Pregão - Presencial",
    8: "Dispensa de Licitação",
    9: "Inexigibilidade",
    10: "Manifestação de Interesse",
    11: "Pré-qualificação",
    12: "Credenciamento",
    13: "Leilão - Presencial",
}


def carregar_json(path: Path, default):
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def salvar_json(path: Path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def buscar_pagina(params: dict, tentativas: int = 6) -> dict:
    url = PNCP_BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    espera = 4
    ultimo_erro = None
    for tentativa in range(tentativas):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                corpo = resp.read().decode().strip()
                if not corpo:
                    return {"data": []}
                return json.loads(corpo)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                ultimo_erro = e
                time.sleep(espera)
                espera = min(espera * 2, 30)
                continue
            if e.code == 204:
                return {"data": []}
            raise
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            # PNCP as vezes devolve corpo vazio/invalido sob rate limit sem
            # sinalizar 429 explicito no status HTTP - trata como retry tambem.
            ultimo_erro = e
            time.sleep(espera)
            espera = min(espera * 2, 30)
            continue
    raise RuntimeError(f"falha apos {tentativas} tentativas: {ultimo_erro}")


def objeto_relevante(item: dict, termos: list) -> bool:
    haystack = " ".join(
        filter(
            None,
            [
                item.get("objetoCompra"),
                item.get("informacaoComplementar"),
            ],
        )
    ).lower()
    return any(termo.lower() in haystack for termo in termos)


def resumir(item: dict, cidade: str) -> dict:
    return {
        "numeroControlePNCP": item.get("numeroControlePNCP"),
        "cidade": cidade,
        "orgao": (item.get("orgaoEntidade") or {}).get("razaoSocial"),
        "modalidade": item.get("modalidadeNome"),
        "objeto": item.get("objetoCompra"),
        "situacao": item.get("situacaoCompraNome"),
        "valorEstimado": item.get("valorTotalEstimado") or item.get("valorTotalHomologado"),
        "dataPublicacao": item.get("dataPublicacaoPncp"),
        "dataAbertura": item.get("dataAberturaProposta"),
        "dataEncerramento": item.get("dataEncerramentoProposta"),
        "link": item.get("linkSistemaOrigem"),
    }


def coletar(dias: int = 3, todas: bool = False, sem_dedupe: bool = False, log=None) -> dict:
    """Consulta o PNCP e devolve o dict de resultado. Reutilizavel por outros
    scripts do skill (ex: gerar_painel.py) sem precisar de subprocess."""
    log = log or (lambda msg: print(msg, file=sys.stderr))

    municipios_cfg = carregar_json(CONFIG_DIR / "municipios.json", {"municipios": []})
    palavras_cfg = carregar_json(CONFIG_DIR / "palavras_chave.json", {"termos": []})
    vistos = set(carregar_json(DATA_DIR / "vistos.json", []))

    municipios = municipios_cfg["municipios"]
    termos = palavras_cfg["termos"]

    hoje = datetime.now()
    data_final = hoje.strftime("%Y%m%d")
    data_inicial = (hoje - timedelta(days=dias)).strftime("%Y%m%d")

    log(
        f"Consultando PNCP de {data_inicial} a {data_final} "
        f"em {len(municipios)} municipios x {len(MODALIDADES)} modalidades..."
    )

    encontrados = []
    falhas = []

    for m in municipios:
        for modalidade in MODALIDADES:
            params = {
                "dataInicial": data_inicial,
                "dataFinal": data_final,
                "codigoModalidadeContratacao": modalidade,
                "codigoMunicipioIbge": m["codigoIbge"],
                "pagina": 1,
                "tamanhoPagina": 50,
            }
            try:
                pagina = buscar_pagina(params)
            except Exception as e:
                falhas.append({"cidade": m["nome"], "modalidade": modalidade, "erro": str(e)})
                continue

            for item in pagina.get("data", []):
                if not todas and not objeto_relevante(item, termos):
                    continue
                resumo = resumir(item, m["nome"])
                if not sem_dedupe and resumo["numeroControlePNCP"] in vistos:
                    continue
                encontrados.append(resumo)
                if resumo["numeroControlePNCP"]:
                    vistos.add(resumo["numeroControlePNCP"])

            time.sleep(2.0)  # respeita rate limit do PNCP

    encontrados.sort(key=lambda r: (r["dataEncerramento"] or "9999", r["cidade"]))

    if not sem_dedupe:
        salvar_json(DATA_DIR / "vistos.json", sorted(vistos))

    return {
        "geradoEm": hoje.isoformat(),
        "janela": {"dataInicial": data_inicial, "dataFinal": data_final},
        "totalEncontrados": len(encontrados),
        "falhas": falhas,
        "editais": encontrados,
    }


def main():
    parser = argparse.ArgumentParser(description="Radar de licitacoes PNCP - Crateus/Inhamuns")
    parser.add_argument("--dias", type=int, default=3, help="Janela de dias a consultar (padrao: 3)")
    parser.add_argument(
        "--todas",
        action="store_true",
        help="Ignora o filtro de palavras-chave e lista todos os editais das cidades (para auditoria)",
    )
    parser.add_argument(
        "--sem-dedupe",
        action="store_true",
        help="Nao filtra editais ja vistos em execucoes anteriores",
    )
    args = parser.parse_args()

    resultado = coletar(dias=args.dias, todas=args.todas, sem_dedupe=args.sem_dedupe)
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
