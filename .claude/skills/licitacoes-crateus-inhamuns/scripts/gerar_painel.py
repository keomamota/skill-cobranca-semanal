#!/usr/bin/env python3
"""
Gera o painel HTML (Artifact) com as licitacoes abertas de interesse da
Nobre Lar na regiao de Crateus/Inhamuns. Roda a coleta do PNCP e escreve um
arquivo HTML autocontido em SKILL_DIR/painel/index.html, pronto para
publicar/republicar via Artifact.

Uso:
    python3 gerar_painel.py [--dias 30] [--saida caminho.html]
"""
import argparse
import html
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from buscar_editais import coletar  # noqa: E402

SKILL_DIR = Path(__file__).resolve().parent.parent
SAIDA_PADRAO = SKILL_DIR / "painel" / "index.html"

FUSO_CE = timezone(timedelta(hours=-3))


def esta_aberto(edital: dict, agora: datetime) -> bool:
    if edital.get("situacao") == "Suspensa":
        return False
    enc = edital.get("dataEncerramento")
    if not enc:
        return True
    try:
        dt = datetime.fromisoformat(enc)
    except ValueError:
        return True
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=FUSO_CE)
    return dt >= agora


def fmt_moeda(valor):
    if valor is None:
        return "—"
    return "R$ " + f"{valor:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def fmt_data(iso):
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return iso
    return dt.strftime("%d/%m/%Y %Hh%M")


def dias_restantes(iso, agora: datetime):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=FUSO_CE)
    delta = dt - agora
    return delta.total_seconds() / 86400


def urgencia(dias_rest):
    if dias_rest is None:
        return "info"
    if dias_rest <= 1:
        return "crit"
    if dias_rest <= 4:
        return "warn"
    return "good"


def texto_urgencia(dias_rest):
    if dias_rest is None:
        return "sem prazo definido"
    if dias_rest < 0:
        return "encerrado"
    if dias_rest < 1:
        horas = max(int(dias_rest * 24), 0)
        return f"encerra em {horas}h" if horas else "encerra hoje"
    dias_int = int(dias_rest)
    return f"encerra em {dias_int} dia{'s' if dias_int != 1 else ''}"


TEMPLATE = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Radar de Licitacoes - Nobre Lar</title>
<style>
:root{{
  --bg:#FBF8F1; --surface:#FFFFFF; --surface-2:#F3EDDC;
  --ink:#241D10; --ink-soft:#6E6450; --border:#E7DFC9;
  --accent:#F2C10E; --accent-ink:#4A3800; --accent-soft:#FCEDB3;
  --good:#2E7D4F; --good-bg:#E4F3E8;
  --warn:#B8790F; --warn-bg:#FCEFD8;
  --crit:#B23B3B; --crit-bg:#FBE7E4;
  --info:#6E6450; --info-bg:#F0EADA;
  --shadow: 0 1px 2px rgba(36,29,16,.06), 0 8px 24px -12px rgba(36,29,16,.18);
}}
@media (prefers-color-scheme: dark){{
  :root:not([data-theme="light"]){{
    --bg:#15110A; --surface:#1E1910; --surface-2:#262014;
    --ink:#F3EEDF; --ink-soft:#B7AC93; --border:#362D1C;
    --accent:#F2C10E; --accent-ink:#2A1D00; --accent-soft:#4A3800;
    --good:#5CBE8A; --good-bg:#173226;
    --warn:#E7A93E; --warn-bg:#3A2C10;
    --crit:#E2685F; --crit-bg:#3A1D1A;
    --info:#B7AC93; --info-bg:#262014;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6);
  }}
}}
:root[data-theme="dark"]{{
  --bg:#15110A; --surface:#1E1910; --surface-2:#262014;
  --ink:#F3EEDF; --ink-soft:#B7AC93; --border:#362D1C;
  --accent:#F2C10E; --accent-ink:#2A1D00; --accent-soft:#4A3800;
  --good:#5CBE8A; --good-bg:#173226;
  --warn:#E7A93E; --warn-bg:#3A2C10;
  --crit:#E2685F; --crit-bg:#3A1D1A;
  --info:#B7AC93; --info-bg:#262014;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6);
}}

*{{box-sizing:border-box;}}
html,body{{margin:0;padding:0;}}
body{{
  background:var(--bg); color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}}
.wrap{{max-width:1160px;margin:0 auto;padding:28px 24px 64px;}}

header.topo{{
  display:flex; align-items:flex-start; justify-content:space-between; gap:20px;
  flex-wrap:wrap; padding-bottom:22px; margin-bottom:26px; border-bottom:1px solid var(--border);
}}
.marca{{display:flex; align-items:center; gap:12px;}}
.selo{{
  width:44px;height:44px;border-radius:10px;background:var(--accent);
  display:flex;align-items:center;justify-content:center;
  font-family:Georgia,"Iowan Old Style","Palatino Linotype",serif;
  font-weight:700;font-size:19px;color:var(--accent-ink);flex-shrink:0;
}}
.titulo h1{{
  font-family:Georgia,"Iowan Old Style","Palatino Linotype",serif;
  font-weight:600; font-size:26px; margin:0 0 3px; letter-spacing:.2px; text-wrap:balance;
}}
.titulo p{{margin:0; color:var(--ink-soft); font-size:14px;}}
.meta-topo{{text-align:right; font-size:12.5px; color:var(--ink-soft); line-height:1.6;}}
.meta-topo strong{{color:var(--ink); font-weight:600;}}

.kpis{{
  display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:28px;
}}
@media (max-width:760px){{ .kpis{{grid-template-columns:repeat(2,1fr);}} }}
.kpi{{
  background:var(--surface); border:1px solid var(--border); border-radius:12px;
  padding:16px 18px; box-shadow:var(--shadow);
}}
.kpi .rotulo{{
  font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-soft);
  margin-bottom:8px; font-weight:600;
}}
.kpi .valor{{
  font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-size:26px; font-weight:600;
  font-variant-numeric:tabular-nums; letter-spacing:-.02em;
}}
.kpi .valor.destaque{{color:var(--accent-ink); background:none;}}
:root[data-theme="dark"] .kpi .valor.destaque, @media (prefers-color-scheme:dark){{}}

.barra{{
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  flex-wrap:wrap; margin-bottom:18px;
}}
.chips{{display:flex; gap:8px; flex-wrap:wrap;}}
.chip{{
  border:1px solid var(--border); background:var(--surface); color:var(--ink-soft);
  border-radius:999px; padding:6px 13px; font-size:13px; cursor:pointer; font-weight:500;
  transition:background .12s,color .12s,border-color .12s;
}}
.chip:hover{{border-color:var(--accent);}}
.chip.ativo{{background:var(--accent); border-color:var(--accent); color:var(--accent-ink); font-weight:600;}}
.contador{{font-size:13px;color:var(--ink-soft);}}

.grade{{display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px;}}
.card{{
  background:var(--surface); border:1px solid var(--border); border-radius:14px;
  padding:18px; display:flex; flex-direction:column; gap:12px; box-shadow:var(--shadow);
}}
.card .linha1{{display:flex; align-items:center; justify-content:space-between; gap:10px;}}
.selo-modalidade{{
  font-size:11.5px; font-weight:600; color:var(--ink-soft); background:var(--surface-2);
  border-radius:6px; padding:3px 9px; text-transform:uppercase; letter-spacing:.03em;
}}
.pill{{
  font-size:12px; font-weight:600; border-radius:999px; padding:4px 11px; white-space:nowrap;
}}
.pill.crit{{background:var(--crit-bg); color:var(--crit);}}
.pill.warn{{background:var(--warn-bg); color:var(--warn);}}
.pill.good{{background:var(--good-bg); color:var(--good);}}
.pill.info{{background:var(--info-bg); color:var(--info);}}

.card .cidade{{font-size:13px; color:var(--ink-soft); font-weight:600;}}
.card .orgao{{font-size:13px; color:var(--ink-soft);}}
.card .objeto{{
  font-size:15px; line-height:1.45; margin:0; display:-webkit-box;
  -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden;
}}
.card .objeto.expandido{{-webkit-line-clamp:unset;}}
.ver-mais{{
  font-size:12.5px; color:var(--ink-soft); background:none; border:none; cursor:pointer;
  padding:0; text-decoration:underline; text-align:left; width:fit-content;
}}

.rodape-card{{
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  border-top:1px solid var(--border); padding-top:12px; margin-top:auto; flex-wrap:wrap;
}}
.valor-estimado{{
  font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-weight:600; font-size:15px;
  font-variant-numeric:tabular-nums;
}}
.datas{{font-size:12px; color:var(--ink-soft); font-variant-numeric:tabular-nums;}}
.btn-link{{
  background:var(--accent); color:var(--accent-ink); text-decoration:none; font-weight:600;
  font-size:13px; padding:8px 14px; border-radius:8px; white-space:nowrap;
  transition:filter .12s;
}}
.btn-link:hover{{filter:brightness(0.95);}}
.btn-link:focus-visible, .chip:focus-visible, .ver-mais:focus-visible{{
  outline:2px solid var(--accent); outline-offset:2px;
}}

.vazio{{
  text-align:center; padding:60px 20px; color:var(--ink-soft); font-size:15px;
  border:1px dashed var(--border); border-radius:14px; background:var(--surface);
}}

footer.rodape{{margin-top:40px; font-size:12px; color:var(--ink-soft); text-align:center;}}

@media (prefers-reduced-motion: reduce){{ *{{transition:none !important;}} }}
</style>
</head>
<body>
<div class="wrap">

  <header class="topo">
    <div class="marca">
      <div class="selo">NL</div>
      <div class="titulo">
        <h1>Radar de Licitações</h1>
        <p>Crateús &amp; região dos Inhamuns (CE) · material de construção · Nobre Lar</p>
      </div>
    </div>
    <div class="meta-topo">
      Atualizado em <strong>{atualizado_em}</strong><br>
      Janela consultada: últimos {janela_dias} dias · fonte: PNCP
    </div>
  </header>

  <section class="kpis">
    <div class="kpi">
      <div class="rotulo">Editais abertos</div>
      <div class="valor destaque">{total_abertos}</div>
    </div>
    <div class="kpi">
      <div class="rotulo">Valor total em disputa</div>
      <div class="valor">{valor_total_fmt}</div>
    </div>
    <div class="kpi">
      <div class="rotulo">Encerrando em 4 dias</div>
      <div class="valor">{urgentes}</div>
    </div>
    <div class="kpi">
      <div class="rotulo">Cidades com edital aberto</div>
      <div class="valor">{cidades_count}</div>
    </div>
  </section>

  <div class="barra">
    <div class="chips" id="chips-cidade"></div>
    <div class="contador" id="contador">{total_abertos} de {total_abertos} editais</div>
  </div>

  <section class="grade" id="grade"></section>
  <div class="vazio" id="vazio" style="display:none;">Nenhum edital aberto encontrado para o filtro selecionado.</div>

  <footer class="rodape">
    Gerado automaticamente a partir do PNCP (Portal Nacional de Contratações Públicas) ·
    filtro de palavras-chave configurável em <code>config/palavras_chave.json</code> ·
    skill <code>licitacoes-crateus-inhamuns</code>
  </footer>
</div>

<script>
const EDITAIS = {editais_json};

function escapeHtml(s) {{
  const d = document.createElement('div');
  d.textContent = s == null ? '' : s;
  return d.innerHTML;
}}

let filtroCidade = null;

function render() {{
  const grade = document.getElementById('grade');
  const vazio = document.getElementById('vazio');
  const contador = document.getElementById('contador');
  const lista = filtroCidade ? EDITAIS.filter(e => e.cidade === filtroCidade) : EDITAIS;

  contador.textContent = lista.length + ' de ' + EDITAIS.length + ' editais';
  grade.innerHTML = '';
  vazio.style.display = lista.length ? 'none' : 'block';

  for (const e of lista) {{
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="linha1">
        <span class="selo-modalidade">${{escapeHtml(e.modalidade || '—')}}</span>
        <span class="pill ${{e.urgenciaClasse}}">${{escapeHtml(e.urgenciaTexto)}}</span>
      </div>
      <div class="cidade">${{escapeHtml(e.cidade)}} · <span class="orgao">${{escapeHtml(e.orgao || 'órgão não informado')}}</span></div>
      <p class="objeto">${{escapeHtml(e.objeto || '(objeto não informado)')}}</p>
      <button class="ver-mais" type="button" data-acao="expandir">ver objeto completo</button>
      <div class="rodape-card">
        <div>
          <div class="valor-estimado">${{escapeHtml(e.valorFmt)}}</div>
          <div class="datas">publicado ${{escapeHtml(e.dataPublicacaoFmt)}} · encerra ${{escapeHtml(e.dataEncerramentoFmt)}}</div>
        </div>
        ${{e.link ? `<a class="btn-link" href="${{escapeHtml(e.link)}}" target="_blank" rel="noopener">Abrir no PNCP</a>` : ''}}
      </div>
    `;
    const objetoEl = card.querySelector('.objeto');
    const botaoEl = card.querySelector('[data-acao="expandir"]');
    botaoEl.addEventListener('click', () => {{
      objetoEl.classList.toggle('expandido');
      botaoEl.textContent = objetoEl.classList.contains('expandido') ? 'recolher' : 'ver objeto completo';
    }});
    grade.appendChild(card);
  }}
}}

function montarChips() {{
  const cidades = [...new Set(EDITAIS.map(e => e.cidade))].sort();
  const container = document.getElementById('chips-cidade');
  const todas = document.createElement('button');
  todas.className = 'chip ativo';
  todas.type = 'button';
  todas.textContent = 'Todas as cidades';
  todas.addEventListener('click', () => {{
    filtroCidade = null;
    [...container.children].forEach(c => c.classList.remove('ativo'));
    todas.classList.add('ativo');
    render();
  }});
  container.appendChild(todas);

  for (const cidade of cidades) {{
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = cidade;
    chip.addEventListener('click', () => {{
      filtroCidade = cidade;
      [...container.children].forEach(c => c.classList.remove('ativo'));
      chip.classList.add('ativo');
      render();
    }});
    container.appendChild(chip);
  }}
}}

montarChips();
render();
</script>
</body>
</html>
"""


def gerar_html(resultado: dict) -> str:
    agora = datetime.now(FUSO_CE)
    abertos = [e for e in resultado["editais"] if esta_aberto(e, agora)]

    editais_view = []
    valor_total = 0.0
    urgentes = 0
    for e in abertos:
        dr = dias_restantes(e["dataEncerramento"], agora)
        if dr is not None and dr <= 4 and dr >= 0:
            urgentes += 1
        if e.get("valorEstimado"):
            valor_total += e["valorEstimado"]
        editais_view.append(
            {
                **e,
                "valorFmt": fmt_moeda(e.get("valorEstimado")),
                "dataPublicacaoFmt": fmt_data(e.get("dataPublicacao")),
                "dataEncerramentoFmt": fmt_data(e.get("dataEncerramento")),
                "urgenciaClasse": urgencia(dr),
                "urgenciaTexto": texto_urgencia(dr),
            }
        )

    cidades = {e["cidade"] for e in abertos}

    return TEMPLATE.format(
        atualizado_em=agora.strftime("%d/%m/%Y às %Hh%M"),
        janela_dias=(
            datetime.strptime(resultado["janela"]["dataFinal"], "%Y%m%d")
            - datetime.strptime(resultado["janela"]["dataInicial"], "%Y%m%d")
        ).days,
        total_abertos=len(abertos),
        valor_total_fmt=fmt_moeda(valor_total) if valor_total else "—",
        urgentes=urgentes,
        cidades_count=len(cidades),
        editais_json=json.dumps(editais_view, ensure_ascii=False),
    )


def main():
    parser = argparse.ArgumentParser(description="Gera o painel HTML de licitacoes abertas")
    parser.add_argument("--dias", type=int, default=30, help="Janela de dias a consultar (padrao: 30)")
    parser.add_argument("--saida", type=str, default=str(SAIDA_PADRAO))
    args = parser.parse_args()

    resultado = coletar(dias=args.dias, todas=False, sem_dedupe=True)
    saida_path = Path(args.saida)
    saida_path.parent.mkdir(parents=True, exist_ok=True)
    saida_path.write_text(gerar_html(resultado), encoding="utf-8")
    print(f"Painel gerado em {saida_path}", file=sys.stderr)
    print(json.dumps({"saida": str(saida_path), "totalAbertos": resultado["totalEncontrados"]}))


if __name__ == "__main__":
    main()
