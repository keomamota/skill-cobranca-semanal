#!/usr/bin/env python3
"""
Injeta o JSON gerado por gerar_relatorio.py no template do painel de cobranca
e escreve o HTML final, pronto para publicar como Artifact.

Uso:
    python3 build_dashboard_html.py <dashboard_data.json> <pasta_saida> <sheet_id> <gid_tratativas> [pix_chave] [pix_beneficiario]
"""
import sys
import os
import json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

PIX_CHAVE_PADRAO = "11.084.977/0001-50"
PIX_BENEFICIARIO_PADRAO = "Nobre Lar"


def main():
    if len(sys.argv) < 5:
        print("Uso: build_dashboard_html.py <dashboard_data.json> <pasta_saida> <sheet_id> <gid_tratativas> [pix_chave] [pix_beneficiario]", file=sys.stderr)
        sys.exit(1)

    dados_path = sys.argv[1]
    saida_dir = sys.argv[2]
    sheet_id = sys.argv[3]
    gid_tratativas = sys.argv[4]
    pix_chave = sys.argv[5] if len(sys.argv) > 5 else PIX_CHAVE_PADRAO
    pix_beneficiario = sys.argv[6] if len(sys.argv) > 6 else PIX_BENEFICIARIO_PADRAO

    with open(dados_path, encoding="utf-8") as f:
        dashboard = json.load(f)

    with open(os.path.join(SCRIPT_DIR, "template_dashboard.html"), encoding="utf-8") as f:
        template = f.read()

    sheet_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit#gid={gid_tratativas}"
    ano = dashboard["hoje_iso"][:4]

    html = template
    html = html.replace("__DASHBOARD_DATA_JSON__", json.dumps(dashboard, ensure_ascii=False))
    html = html.replace("__SHEET_URL_VALUE__", sheet_url)
    html = html.replace("__PIX_CHAVE_VALUE__", pix_chave)
    html = html.replace("__PIX_BENEFICIARIO_VALUE__", pix_beneficiario)
    html = html.replace("__DATA_GERACAO__", dashboard["gerado_em"])
    html = html.replace("__ANO__", ano)

    data_str = dashboard["hoje_iso"]
    out_path = os.path.join(saida_dir, f"painel_cobranca_{data_str}.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(json.dumps({"html": out_path}, ensure_ascii=False))


if __name__ == "__main__":
    main()
