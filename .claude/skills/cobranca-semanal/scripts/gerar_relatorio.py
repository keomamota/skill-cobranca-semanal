#!/usr/bin/env python3
"""
Extrai da planilha Google Sheets do Nobre Lar os dados para o painel de cobranca:
  - Aba "Contas a Receber": titulos (data emissao, cliente, valor original, valor em
    aberto, data de vencimento), organizados em blocos de 5 colunas (um bloco por mes
    de vencimento).
  - Aba "Tratativas": historico de contatos de cobranca (Data, Cliente, Status,
    Tratativa, Autor), preenchida manualmente pela equipe direto no Google Sheets.

Gera:
  - 3 CSVs de apoio (inadimplentes do mes, vencimentos 7 dias, inadimplencia total do
    ano agrupada por cliente) - mesmos de antes, para quem quiser abrir no Excel.
  - 1 JSON consolidado (dashboard_data_YYYY-MM-DD.json) com KPIs, series para grafico
    e a lista de clientes com historico de tratativas, para alimentar o painel HTML.
  - Atualiza historico.json (append) com o total de inadimplencia do ano em cada
    execucao, para calcular a variacao semana a semana.

Uso:
    python3 gerar_relatorio.py <caminho_json_fileContent> <pasta_saida> [YYYY-MM-DD]

O <caminho_json_fileContent> e o arquivo .txt/.json salvo pela ferramenta de leitura do
Google Drive (campo top-level "fileContent"). O terceiro argumento opcional forca a data
de "hoje" (default: data atual do sistema) - util para testes.
"""
import sys
import os
import json
import csv
from datetime import date, datetime, timedelta

HEADER_RECEBER = "| DATA DE EMISSÃO | CLIENTES | VALOR ORIGINAL | VALOR EM ABERTO | DATA DE VENCIMENTO |"
HEADER_TRATATIVAS = "| Data | Cliente | Status | Tratativa | Autor |"


def parse_valor(raw):
    raw = raw.strip().replace("R$", "").strip()
    raw = raw.replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def parse_data(raw):
    raw = raw.strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _blocos(linhas, header, n_colunas):
    """Generator: percorre blocos de tabela markdown que comecam com `header`,
    devolvendo cada linha de dados ja quebrada em `n_colunas` campos (sem as
    bordas vazias do markdown)."""
    i = 0
    while i < len(linhas):
        if linhas[i].strip() == header:
            j = i + 1
            while j < len(linhas):
                l = linhas[j].strip()
                if not l.startswith("|"):
                    break
                partes = [p.strip() for p in l.split("|")]
                if len(partes) != n_colunas + 2:
                    j += 1
                    if l.replace("|", "").strip() == "":
                        continue
                    else:
                        break
                yield partes[1:-1]
                j += 1
            i = j
        else:
            i += 1


def extrair_contas_a_receber(content):
    linhas = content.split("\n")
    registros = []
    vistos = set()
    for data_emissao, cliente, valor_orig, valor_aberto, data_venc in _blocos(linhas, HEADER_RECEBER, 5):
        d_venc = parse_data(data_venc)
        if not cliente or d_venc is None:
            continue
        v_orig = parse_valor(valor_orig)
        v_aberto = parse_valor(valor_aberto)
        if v_aberto is None:
            continue
        chave = (data_emissao, cliente, valor_orig, data_venc)
        if chave in vistos:
            continue
        vistos.add(chave)
        registros.append({
            "cliente": cliente,
            "data_emissao": data_emissao,
            "valor_original": v_orig,
            "valor_aberto": v_aberto,
            "data_vencimento": d_venc,
        })
    return registros


def extrair_tratativas(content):
    linhas = content.split("\n")
    tratativas = []
    for data_str, cliente, status, nota, autor in _blocos(linhas, HEADER_TRATATIVAS, 5):
        d = parse_data(data_str)
        if not cliente or d is None:
            continue
        tratativas.append({
            "data": d,
            "cliente": cliente,
            "status": status or "Pendente",
            "nota": nota,
            "autor": autor,
        })
    return tratativas


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
            w.writerow([r["cliente"], formata_moeda(r["valor_aberto"]), r["data_vencimento"].strftime("%d/%m/%Y"), r["extra"]])
            total += r["valor_aberto"]
        w.writerow([])
        w.writerow(["TOTAL", formata_moeda(total), "", f"{len(linhas)} titulo(s)"])
    return total


def escreve_csv_por_cliente(path, titulo, linhas):
    por_cliente = {}
    for r in linhas:
        por_cliente.setdefault(r["cliente"], []).append(r)

    total_geral = 0.0
    qtd_geral = 0
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow([titulo])
        w.writerow([])
        w.writerow(["Cliente", "Valor em aberto", "Data de vencimento", "Dias em atraso"])
        for cliente in sorted(por_cliente.keys()):
            titulos = sorted(por_cliente[cliente], key=lambda r: r["data_vencimento"])
            subtotal = 0.0
            for r in titulos:
                w.writerow([r["cliente"], formata_moeda(r["valor_aberto"]), r["data_vencimento"].strftime("%d/%m/%Y"), f"{r['dias_atraso']} dia(s) em atraso"])
                subtotal += r["valor_aberto"]
            w.writerow(["", f"Subtotal {cliente}: {formata_moeda(subtotal)}", "", f"{len(titulos)} titulo(s)"])
            w.writerow([])
            total_geral += subtotal
            qtd_geral += len(titulos)
        w.writerow(["TOTAL GERAL", formata_moeda(total_geral), "", f"{qtd_geral} titulo(s) / {len(por_cliente)} cliente(s)"])
    return total_geral, len(por_cliente)


def bucket_atraso(dias):
    if dias <= 30:
        return "1-30 dias"
    if dias <= 60:
        return "31-60 dias"
    if dias <= 90:
        return "61-90 dias"
    return "90+ dias"


def atualiza_historico(saida_dir, hoje, total_ano, qtd_clientes_ano):
    path = os.path.join(saida_dir, "historico.json")
    historico = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            historico = json.load(f)
    historico = [h for h in historico if h["data"] != hoje.isoformat()]
    historico.append({"data": hoje.isoformat(), "total_ano": total_ano, "qtd_clientes": qtd_clientes_ano})
    historico.sort(key=lambda h: h["data"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(historico, f, ensure_ascii=False, indent=2)

    referencia = hoje - timedelta(days=7)
    candidatos = [h for h in historico if h["data"] <= referencia.isoformat()]
    if not candidatos:
        return None
    anterior = candidatos[-1]
    return {
        "data_referencia": anterior["data"],
        "total_na_referencia": anterior["total_ano"],
        "variacao": total_ano - anterior["total_ano"],
    }


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

    registros = extrair_contas_a_receber(content)
    tratativas = extrair_tratativas(content)

    inadimplentes = []
    proximos = []
    inadimplencia_ano = []
    limite = hoje + timedelta(days=7)
    serie_mensal = {}

    for r in registros:
        mes_chave = r["data_vencimento"].strftime("%Y-%m")
        serie_mensal.setdefault(mes_chave, {"valor_original": 0.0, "valor_aberto": 0.0, "qtd": 0})
        serie_mensal[mes_chave]["valor_original"] += r["valor_original"] or 0.0
        serie_mensal[mes_chave]["valor_aberto"] += r["valor_aberto"]
        serie_mensal[mes_chave]["qtd"] += 1

        if r["valor_aberto"] <= 0.005:
            continue
        v = r["data_vencimento"]
        vencido_neste_ano = v.year == hoje.year and v < hoje
        if vencido_neste_ano:
            dias_atraso = (hoje - v).days
            item = {**r, "dias_atraso": dias_atraso}
            inadimplencia_ano.append(item)
            if v.month == hoje.month:
                inadimplentes.append({**item, "extra": f"{dias_atraso} dia(s) em atraso"})
        elif hoje <= v <= limite:
            dias_restantes = (v - hoje).days
            proximos.append({**r, "extra": f"vence em {dias_restantes} dia(s)"})

    inadimplentes.sort(key=lambda r: r["data_vencimento"])
    proximos.sort(key=lambda r: r["data_vencimento"])

    os.makedirs(saida_dir, exist_ok=True)
    data_str = hoje.strftime("%Y-%m-%d")

    path_inad = os.path.join(saida_dir, f"inadimplentes_{data_str}.csv")
    path_prox = os.path.join(saida_dir, f"vencimentos_proximos_7_dias_{data_str}.csv")
    path_ano = os.path.join(saida_dir, f"inadimplencia_total_{hoje.year}_{data_str}.csv")

    total_inad = escreve_csv(path_inad, f"INADIMPLENTES DO MES VIGENTE ({hoje.strftime('%m/%Y')}) - gerado em {hoje.strftime('%d/%m/%Y')}", inadimplentes, "Dias em atraso")
    total_prox = escreve_csv(path_prox, f"VENCIMENTOS DOS PROXIMOS 7 DIAS CORRIDOS ({hoje.strftime('%d/%m/%Y')} a {limite.strftime('%d/%m/%Y')})", proximos, "Dias ate o vencimento")
    total_ano, qtd_clientes_ano = escreve_csv_por_cliente(path_ano, f"INADIMPLENCIA TOTAL DE {hoje.year} (todos os meses vencidos, agrupado por cliente) - gerado em {hoje.strftime('%d/%m/%Y')}", inadimplencia_ano)

    variacao = atualiza_historico(saida_dir, hoje, total_ano, qtd_clientes_ano)

    # aging buckets (sobre a inadimplencia total do ano)
    aging = {}
    for r in inadimplencia_ano:
        b = bucket_atraso(r["dias_atraso"])
        aging.setdefault(b, {"valor": 0.0, "qtd": 0})
        aging[b]["valor"] += r["valor_aberto"]
        aging[b]["qtd"] += 1
    ordem_buckets = ["1-30 dias", "31-60 dias", "61-90 dias", "90+ dias"]
    aging_lista = [{"faixa": b, "valor": aging.get(b, {"valor": 0.0})["valor"], "qtd": aging.get(b, {"qtd": 0})["qtd"]} for b in ordem_buckets]

    # tratativas por cliente (mais recente primeiro), e quem foi contatado nos ultimos 7 dias
    tratativas_por_cliente = {}
    for t in tratativas:
        tratativas_por_cliente.setdefault(t["cliente"], []).append(t)
    for lst in tratativas_por_cliente.values():
        lst.sort(key=lambda t: t["data"], reverse=True)

    contatados_semana = {t["cliente"] for t in tratativas if (hoje - t["data"]).days <= 7}

    # lista de clientes inadimplentes (ano) com titulos + status/tratativas
    clientes_map = {}
    for r in inadimplencia_ano:
        c = clientes_map.setdefault(r["cliente"], {"cliente": r["cliente"], "total_aberto": 0.0, "titulos": []})
        c["total_aberto"] += r["valor_aberto"]
        c["titulos"].append({
            "data_vencimento": r["data_vencimento"].strftime("%d/%m/%Y"),
            "valor_aberto": r["valor_aberto"],
            "dias_atraso": r["dias_atraso"],
        })

    clientes = []
    for c in clientes_map.values():
        hist = tratativas_por_cliente.get(c["cliente"], [])
        status_atual = hist[0]["status"] if hist else "Pendente"
        c["titulos"].sort(key=lambda t: t["dias_atraso"], reverse=True)
        clientes.append({
            **c,
            "qtd_titulos": len(c["titulos"]),
            "status_atual": status_atual,
            "contatado_essa_semana": c["cliente"] in contatados_semana,
            "tratativas": [
                {"data": t["data"].strftime("%d/%m/%Y"), "status": t["status"], "nota": t["nota"], "autor": t["autor"]}
                for t in hist
            ],
        })
    clientes.sort(key=lambda c: c["total_aberto"], reverse=True)

    qtd_contatados_geral = sum(1 for c in clientes if c["tratativas"])
    cobertura_pct = (qtd_contatados_geral / len(clientes) * 100) if clientes else 0.0

    dashboard = {
        "gerado_em": hoje.strftime("%d/%m/%Y"),
        "hoje_iso": hoje.isoformat(),
        "kpis": {
            "inadimplencia_total_ano": {"valor": total_ano, "qtd_titulos": len(inadimplencia_ano), "qtd_clientes": qtd_clientes_ano},
            "inadimplentes_mes_vigente": {"valor": total_inad, "qtd_titulos": len(inadimplentes)},
            "vencimentos_7_dias": {"valor": total_prox, "qtd_titulos": len(proximos)},
            "clientes_contatados_semana": len(contatados_semana),
            "cobertura_contato_pct": cobertura_pct,
            "variacao_semana": variacao,
        },
        "serie_mensal": [
            {"mes": mes, **vals} for mes, vals in sorted(serie_mensal.items())
        ],
        "aging": aging_lista,
        "clientes": clientes,
        "vencimentos_proximos": [
            {"cliente": r["cliente"], "valor_aberto": r["valor_aberto"], "data_vencimento": r["data_vencimento"].strftime("%d/%m/%Y"), "extra": r["extra"]}
            for r in proximos
        ],
        "atividade_recente": [
            {"data": t["data"].strftime("%d/%m/%Y"), "cliente": t["cliente"], "status": t["status"], "nota": t["nota"], "autor": t["autor"]}
            for t in sorted(tratativas, key=lambda t: t["data"], reverse=True)[:20]
        ],
    }

    path_dashboard = os.path.join(saida_dir, f"dashboard_data_{data_str}.json")
    with open(path_dashboard, "w", encoding="utf-8") as f:
        json.dump(dashboard, f, ensure_ascii=False, indent=2)

    print(json.dumps({
        "registros_lidos": len(registros),
        "tratativas_lidas": len(tratativas),
        "inadimplentes": {"qtd": len(inadimplentes), "total": total_inad, "arquivo": path_inad},
        "proximos_7_dias": {"qtd": len(proximos), "total": total_prox, "arquivo": path_prox},
        "inadimplencia_total_ano": {"qtd_titulos": len(inadimplencia_ano), "qtd_clientes": qtd_clientes_ano, "total": total_ano, "arquivo": path_ano},
        "dashboard_json": path_dashboard,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
