import type { LinhaRanking } from "../kpis/ranking";
import type { ResumoFunil } from "../kpis/funil";
import { percentual, taxaResolucao, taxaGanhoBruta } from "../kpis/funil";
import { esc, chip } from "./layout";

export interface DadosVendedores {
  linhas: LinhaRanking[];
  b2b: { nome: string; funil: ResumoFunil }[];
  totalLeads: number;
  regra: { descricao: string; desde: string };
  calculadoEm: string | null;
  desatualizado: boolean;
  janelaLeads: 7 | 30 | 60;
  semVendedor: { semAtendente: number; novos: number; saudavel: boolean } | null;
}

export const CSS_VENDEDORES = `
.titulo h2{margin:0;font-size:22px;font-weight:800}.titulo p{margin:2px 0 14px;color:var(--nl-text-muted);font-size:13px}
.seletor{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 16px;align-items:center;font-size:12px}
.seletor a{padding:10px 14px;border:1px solid var(--nl-gray-border);background:#fff;border-radius:6px;color:var(--nl-black);text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.seletor a[aria-current="true"]{background:var(--nl-black);color:#fff;border-color:var(--nl-black)}
.regra{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:22px;background:#fff;border:1px solid var(--nl-gray-border);border-radius:12px;padding:20px 22px;margin-bottom:22px}
.regra h4{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--nl-text-muted)}
.peso{display:flex;height:34px;border-radius:6px;overflow:hidden;margin:10px 0 8px;font-weight:800;font-size:13px}
.peso span{display:flex;align-items:center;justify-content:center;color:#fff}
.vh,.vr{display:grid;grid-template-columns:minmax(0,1.5fr) 1.4fr .5fr .5fr .5fr .7fr 1.7fr 1fr;gap:12px;align-items:center;padding:14px 20px}
.vh{background:var(--nl-gray-bg);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--nl-text-muted)}
.vr{border-top:1px solid var(--nl-gray-border)}
.grupo{padding:10px 20px;background:#FAFAF8;border-top:1px solid var(--nl-gray-border);font-size:12px;font-weight:700;color:var(--nl-text-muted)}
.sbar{height:10px;background:#ECECE8;border-radius:5px;overflow:hidden}.sbar i{display:block;height:100%;background:var(--nl-black)}
.destaque{color:var(--nl-red);font-weight:700}
.fh{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,3fr) 1fr;gap:14px;padding:16px 20px;border-top:1px solid var(--nl-gray-border);align-items:center}
.stack{display:flex;height:26px;border-radius:5px;overflow:hidden;background:#ECECE8}.stack i{display:block;height:100%}
.c-at{background:#0D0D0D}.c-fr{background:#B9B9B2}.c-ga{background:#1E7A34}.c-pe{background:#B3261E}
.c-in{background:repeating-linear-gradient(45deg,#E2CD66 0 5px,#C9A100 5px 9px)}
.fnum{font-size:12px;color:var(--nl-text-muted);margin-top:6px}.fnum span{margin-right:12px}
.leg{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--nl-text-muted);padding:12px 20px;border-top:1px solid var(--nl-gray-border)}
.leg b{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:6px;vertical-align:-1px}
h3.sec{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--nl-text-muted);margin:6px 0 8px}
@media (max-width:900px){.regra{grid-template-columns:1fr}.vh{display:none}.vr{grid-template-columns:1fr 1fr}.vr>:first-child{grid-column:1/-1}.fh{grid-template-columns:1fr}}
`;

function pctTxt(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function celulaLeads(l: LinhaRanking): string {
  const p = l.leads;
  if (!p) return `<span class="num"><b>0</b> · 0,0%</span><div style="font-size:12px;color:var(--nl-text-muted)">sem lead no período</div>`;
  const cota =
    p.pctEsperado === null
      ? `<div style="font-size:12px;color:var(--nl-text-muted)">sem participação esperada (fora da lista de destinos)</div>`
      : `<div style="font-size:12px;${p.destaque ? "" : "color:var(--nl-text-muted)"}" class="${p.destaque ? "destaque" : ""}">esperado ${pctTxt(p.pctEsperado)}% pela regra · desvio ${(p.desvioPP ?? 0) >= 0 ? "+" : ""}${pctTxt(p.desvioPP ?? 0)} pp${p.destaque ? " (acima de 10 pp)" : ""}</div>`;
  return `<span class="num"><b>${p.n}</b> · ${pctTxt(p.pct)}%</span><div style="font-size:12px;color:var(--nl-text-muted)">último lead em ${p.ultimo ? esc(p.ultimo.slice(0, 10)) : "—"}</div>${cota}`;
}

function chipConfianca(l: LinhaRanking): string {
  if (l.leads && l.leads.foraDaDistribuicao) return chip("bad", "Fora da distribuição");
  if (l.confianca === "parcial") return chip("att", "Confiança parcial");
  if (l.confianca === "sem_score") return chip("peq", "Sem score");
  return chip("ok", "Confiança plena");
}

export function renderVendedores(d: DadosVendedores): string {
  const aviso = d.desatualizado
    ? `<div class="aviso" role="status">Mostrando dados de ${d.calculadoEm ? esc(d.calculadoEm) + " (UTC)" : "data desconhecida"}: a atualização de hoje não chegou. Os valores não foram zerados.</div>`
    : "";

  const seletor = ([7, 30, 60] as const)
    .map((n) => `<a href="?dias=${n}"${n === d.janelaLeads ? ' aria-current="true"' : ""}>${n} dias</a>`)
    .join("");

  let rank = 0;
  let grupoAnterior = "";
  const linhas = d.linhas
    .map((l) => {
      const grupo = l.confianca === "plena" ? "" : l.confianca === "parcial" ? "Confiança parcial: fora da ordem do ranking, em ordem alfabética" : "Sem score calculado";
      const cab = grupo && grupo !== grupoAnterior ? `<div class="grupo">${esc(grupo)}</div>` : "";
      grupoAnterior = grupo || grupoAnterior;
      const pos = l.confianca === "plena" ? `${++rank}. ` : "";
      const s = l.score;
      const sf = s && Number.isFinite(s.score_final) ? s.score_final : null;
      return `${cab}<div class="vr" role="row">
  <div><b>${pos}${esc(l.nome)}</b>${l.nota ? `<div style="font-size:12px;color:var(--nl-text-muted)">${esc(l.nota)}</div>` : ""}</div>
  <div>${sf === null ? "—" : `<span class="num" style="font-weight:800;font-size:18px">${pctTxt(sf)}</span><div class="sbar" aria-hidden="true"><i style="width:${Math.min(100, Math.max(0, sf)).toFixed(2)}%"></i></div>`}</div>
  <div class="num">${s ? Math.round(s.score_velocidade) : "—"}</div>
  <div class="num">${s ? Math.round(s.score_resolucao) : "—"}</div>
  <div class="num">${s ? Math.round(s.score_ganho) : "—"}</div>
  <div class="num">${s && s.mediana_minutos_resposta !== null ? Math.round(s.mediana_minutos_resposta) + " min" : "—"}</div>
  <div>${celulaLeads(l)}</div>
  <div>${chipConfianca(l)}</div>
</div>`;
    })
    .join("\n");

  const funis = d.linhas
    .map((l) => {
      const f = l.funil;
      const t = f.total;
      const w = (n: number) => (t > 0 ? ((n / t) * 100).toFixed(2) : "0");
      const tr = taxaResolucao(f);
      const tg = taxaGanhoBruta(f);
      return `<div class="fh">
  <div><b>${esc(l.nome)}</b><div style="font-size:12px;color:var(--nl-text-muted)" class="num">${t} negócios · ${f.ganho} ganhos · ${f.perdido} perdidos · ${f.ganho + f.perdido} resolvidos</div></div>
  <div><div class="stack" role="img" aria-label="${esc(l.nome)}: ${f.em_atendimento} em atendimento, ${f.frio} frio, ${f.ganho} ganho, ${f.perdido} perdido, ${f.inconsistente} inconsistente">
    <i class="c-at" style="width:${w(f.em_atendimento)}%"></i><i class="c-fr" style="width:${w(f.frio)}%"></i><i class="c-ga" style="width:${w(f.ganho)}%"></i><i class="c-pe" style="width:${w(f.perdido)}%"></i><i class="c-in" style="width:${w(f.inconsistente)}%"></i></div>
    <div class="fnum num"><span>Atendimento ${f.em_atendimento} (${percentual(f.em_atendimento, t)}%)</span><span>Frio ${f.frio} (${percentual(f.frio, t)}%)</span><span>Ganho ${f.ganho} (${percentual(f.ganho, t)}%)</span><span>Perdido ${f.perdido} (${percentual(f.perdido, t)}%)</span><span>Inconsistente ${f.inconsistente} (${percentual(f.inconsistente, t)}%)</span></div></div>
  <div class="num"><b>${tr === null ? "—" : Math.round(tr) + "%"}</b> resolução<div style="font-size:12px;color:var(--nl-text-muted)">${tg === null ? "—" : Math.round(tg) + "%"} ganho entre resolvidos</div></div>
</div>`;
    })
    .join("\n");

  const b2b = d.b2b.length
    ? `<h3 class="sec">Prospecção B2B (separado do varejo)</h3><div class="tabela">${d.b2b
        .map(
          (b) =>
            `<div class="fh"><div><b>${esc(b.nome)}</b></div><div class="num">${b.funil.total} negócios · ${b.funil.em_atendimento} em andamento · ${b.funil.ganho} ganhos · ${b.funil.perdido} perdidos</div><div></div></div>`
        )
        .join("")}</div>`
    : "";

  const sv = d.semVendedor
    ? `<span style="font-size:12px;color:var(--nl-text-muted)">Leads sem vendedor nas últimas 24 h: <b>${d.semVendedor.semAtendente}</b> de ${d.semVendedor.novos} novos${d.semVendedor.saudavel ? "" : " · roteamento marcado como não saudável"}</span>`
    : `<span style="font-size:12px;color:var(--nl-text-muted)">Leads sem vendedor: sem leitura da saúde do roteamento</span>`;

  return `<style>${CSS_VENDEDORES}</style>
<div class="titulo"><h2>Performance por vendedor</h2><p>Scores do roteador · funil do pipeline de vendas, ganhos e perdidos dos últimos 60 dias e todos os abertos · somente leitura</p></div>
${aviso}
<div class="seletor" aria-label="Período dos leads recebidos"><b>Período dos leads:</b>${seletor}</div>
<section class="regra" aria-label="Como o ranking e a distribuição funcionam">
  <div>
    <h4>Critérios do ranking de seleção (score de 0 a 100)</h4>
    <div class="peso" role="img" aria-label="Pesos: velocidade 30%, resolução 30%, ganho 40%"><span style="background:#3a3a36;width:30%">Velocidade 30%</span><span style="background:#6a6a64;width:30%">Resolução 30%</span><span style="background:#0D0D0D;color:#F6DB2C;width:40%">Ganho 40%</span></div>
    <div style="font-size:12.5px;color:var(--nl-text-muted)">Velocidade: mediana do tempo até a 1ª resposta. Resolução: % dos negócios que viram ganho ou perdido. Ganho: taxa de ganho suavizada. Confiança plena com 10 ou mais resolvidos em 60 dias; abaixo disso o vendedor aparece fora da ordem do ranking.</div>
  </div>
  <div>
    <h4>Como os leads são distribuídos hoje</h4>
    <p style="margin:8px 0 0;font-size:13px">${esc(d.regra.descricao)} Em vigor desde ${esc(d.regra.desde)}.</p>
  </div>
</section>
<div class="placar-h" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px"><h3 class="sec" style="margin:0">Ranking e distribuição de leads</h3><span style="font-size:12px;color:var(--nl-text-muted)">${d.totalLeads} leads nos últimos ${d.janelaLeads} dias · ${sv}</span></div>
<div class="tabela" role="table" aria-label="Ranking e distribuição de leads">
  <div class="vh" role="row"><span>Vendedor</span><span>Score final</span><span>Veloc.</span><span>Resol.</span><span>Ganho</span><span>Resposta</span><span>Leads recebidos</span><span>Confiança</span></div>
  ${linhas}
</div>
<h3 class="sec">Funil por vendedor, do lead ao fechamento ou à perda (pipeline de vendas)</h3>
<div class="tabela">${funis}
  <div class="leg"><span><b class="c-at"></b>Em atendimento</span><span><b class="c-fr"></b>Frio</span><span><b class="c-ga"></b>Ganho</span><span><b class="c-pe"></b>Perdido</span><span><b class="c-in"></b>Inconsistente (etapa de ganho ou perda com status aberto)</span></div>
</div>
${b2b}
<p style="font-size:12px;color:var(--nl-text-muted)">Scores calculados em ${d.calculadoEm ? esc(d.calculadoEm) + " (UTC)" : "data desconhecida"} pelo roteador, sobre todos os pipelines; os números do funil acima são só do pipeline de vendas.</p>`;
}
