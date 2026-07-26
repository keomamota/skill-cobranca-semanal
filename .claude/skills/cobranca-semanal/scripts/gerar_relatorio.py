#!/usr/bin/env python3
"""
Extrai da aba "Contas a Receber" (planilha Google Sheets do Nobre Lar) dois relatorios:
  1. Inadimplentes do mes vigente (vencimento no mes atual, ja vencido, saldo em aberto > 0)
  2. Vencimentos dos proximos 7 dias corridos (hoje ate hoje+7, saldo em aberto > 0)

Uso:
    python3 gerar_relatorio.py <caminho_json_fileContent> <pasta_saida> [YYYY-MM-DD]

O <caminho_json_fileContent> e o arquivo .txt/.json salvo pela ferramenta de leitura do
Google Drive (campo top-level "fileContent"). O terceiro argumento opcional forca a data
de "hoje" (default: data atual do sistema) - util para testes.
"""
import sys
import os
import json
import re
import csv
from datetime import date, datetime, timedelta

HEADER_5COL = "| DATA DE EMISSÃO | CLIENTES | VALOR ORIGINAL | VALOR EM ABERTO | DATA DE VENCIMENTO |"


def parse_valor(raw):
    raw = raw.strip().replace("R$", "").strip()
    raw = raw.replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def parse_data(raw):
    raw = raw.strip()
    try:
        return datetime.strptime(raw, "%d/%m/%Y").date()
    except ValueError:
        return None


def extrair_linhas(content):
    """Percorre o dump em markdown e coleta todas as linhas de dados dos blocos
    de 5 colunas (um bloco por mes de vencimento na aba Contas a Receber)."""
    linhas = content.split("\n")
    registros = []
    vistos = set()

    i = 0
    while i < len(linhas):
        if linhas[i].strip() == HEADER_5COL:
            j = i + 1
            while j < len(linhas):
                l = linhas[j].strip()
                if not l.startswith("|"):
                    break
                partes = [p.strip() for p in l.split("|")]
                # formato esperado: ['', data_emissao, cliente, valor_orig, valor_aberto, data_venc, '']
                if len(partes) != 7:
                    j += 1
                    if l.replace("|", "").strip() == "":
                        continue
                    else:
                        break
                _, data_emissao, cliente, valor_orig, valor_aberto, data_venc, _ = partes
                d_venc = parse_data(data_venc)
                if not cliente or d_venc is None:
                    j += 1
                    continue
                v_orig = parse_valor(valor_orig)
                v_aberto = parse_valor(valor_aberto)
                if v_aberto is None:
                    j += 1
                    continue
                chave = (data_emissao, cliente, valor_orig, data_venc)
                if chave not in vistos:
                    vistos.add(chave)
                    registros.append({
                        "cliente": cliente,
                        "data_emissao": data_emissao,
                        "valor_original": v_orig,
                        "valor_aberto": v_aberto,
                        "data_vencimento": d_venc,
                    })
                j += 1
            i = j
        else:
            i += 1
    return registros


def formata_moeda(v):
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def escreve_csv(path, titulo, linhas, campo_extra_nome):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow([titulo])
        w.writerow([])
        w.writerow(["Cliente", "Valor em aberto", "Data de vencimento", campo_extra_nome])
        total = 0.0
        for r in linhas:
            w.writerow([
                r["cliente"],
                formata_moeda(r["valor_aberto"]),
                r["data_vencimento"].strftime("%d/%m/%Y"),
                r["extra"],
            ])
            total += r["valor_aberto"]
        w.writerow([])
        w.writerow(["TOTAL", formata_moeda(total), "", f"{len(linhas)} titulo(s)"])
    return total


def main():
    if len(sys.argv) < 3:
        print("Uso: gerar_relatorio.py <json_fileContent> <pasta_saida> [YYYY-MM-DD]", file=sys.stderr)
        sys.exit(1)

    json_path = sys.argv[1]
    saida_dir = sys.argv[2]
    hoje = date.today()
    if len(sys.argv) > 3:
        hoje = datetime.strptime(sys.argv[3], "%Y-%m-%d").date()

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    content = data["fileContent"]

    registros = extrair_linhas(content)

    inadimplentes = []
    proximos = []
    limite = hoje + timedelta(days=7)

    for r in registros:
        if r["valor_aberto"] <= 0.005:
            continue
        v = r["data_vencimento"]
        if v.year == hoje.year and v.month == hoje.month and v < hoje:
            dias_atraso = (hoje - v).days
            inadimplentes.append({**r, "extra": f"{dias_atraso} dia(s) em atraso"})
        elif hoje <= v <= limite:
            dias_restantes = (v - hoje).days
            proximos.append({**r, "extra": f"vence em {dias_restantes} dia(s)"})

    inadimplentes.sort(key=lambda r: r["data_vencimento"])
    proximos.sort(key=lambda r: r["data_vencimento"])

    os.makedirs(saida_dir, exist_ok=True)
    data_str = hoje.strftime("%Y-%m-%d")

    path_inad = os.path.join(saida_dir, f"inadimplentes_{data_str}.csv")
    path_prox = os.path.join(saida_dir, f"vencimentos_proximos_7_dias_{data_str}.csv")

    total_inad = escreve_csv(
        path_inad,
        f"INADIMPLENTES DO MES VIGENTE ({hoje.strftime('%m/%Y')}) - gerado em {hoje.strftime('%d/%m/%Y')}",
        inadimplentes,
        "Dias em atraso",
    )
    total_prox = escreve_csv(
        path_prox,
        f"VENCIMENTOS DOS PROXIMOS 7 DIAS CORRIDOS ({hoje.strftime('%d/%m/%Y')} a {limite.strftime('%d/%m/%Y')})",
        proximos,
        "Dias ate o vencimento",
    )

    print(json.dumps({
        "registros_lidos": len(registros),
        "inadimplentes": {"qtd": len(inadimplentes), "total": total_inad, "arquivo": path_inad},
        "proximos_7_dias": {"qtd": len(proximos), "total": total_prox, "arquivo": path_prox},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
