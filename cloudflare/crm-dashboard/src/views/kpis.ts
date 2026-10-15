import type { CoorteExibida } from "../kpis/norte";
import type { Meta, ChaveMeta, StatusMeta } from "../kpis/metas";
import { REVISAO_METAS } from "../kpis/metas";
import type { QualidadeLeads } from "../kpis/qualidade";
import { esc, chip } from "./layout";

export interface DadosKpis {
  qualidade: QualidadeLeads;
  fechada: CoorteExibida | null;
  anterior: CoorteExibida | null;
  serie: CoorteExibida[];
  resolucao: { valor: number | null; status: StatusMeta | null; resolvidos: number; ativos: number };
  metas: Record<ChaveMeta, Meta>;
  candidatos: { total: number; inconsistentes: number; parados: number; semData: number };
  parados7d: number;
  semVendedor: { semAtendente: number; novos: number } | null;
  calculadoEm: string | null;
  desatualizado: boolean;
}

export const CSS_KPIS = `
.titulo h2{margin:0;font-size:22px;font-weight:800}.titulo p{margin:2px 0 18px;color:var(--nl-text-muted);font-size:13px}
.norte{background:var(--nl-black);color:#fff;border-radius:12px;padding:26px 28px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:28px;align-items:end;margin-bottom:22px}
.norte .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:700}
.norte .val{font-size:56px;font-weight:800;line-height:1;margin:8px 0 6px;color:var(--nl-yellow)}
.norte .val small{font-size:20px;margin-left:6px;color:#fff}
.norte .indisp{font-size:22px;font-weight:800;color:var(--nl-yellow);margin:8px 0}
.serie{display:flex;align-items:flex-end;gap:6px;height:112px}
.serie .b{flex:1;border-radius:3px 3px 0 0;min-height:4px;background:#6a6a64}
.serie .b.atual{background:var(--nl-yellow)}
.serie .b.parcial{background:transparent;border:2px dashed #C9C9C4}
.lin{display:grid;grid-template-columns:minmax(0,2.3fr) 1fr 1.2fr 1.3fr;gap:14px;align-items:center;padding:16px 20px;border-top:1px solid var(--nl-gray-border)}
.lin:first-child{border-top:0}
.v{font-size:28px;font-weight:800}
.prov{display:block;font-size:11px;font-style:normal;color:var(--nl-text-muted)}
.apoio{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));background:#fff;border:1px solid var(--nl-gray-border);border-radius:12px}
.ap{padding:18px 20px;border-right:1px solid var(--nl-gray-border)}.ap:last-child{border-right:0}
.ap .l{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--nl-text-muted);font-weight:700}.ap .n{font-size:26px;font-weight:800;margin-top:6px}
h3.sec{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--nl-text-muted);margin:6px 0 8px}
@media (max-width:900px){.norte{grid-template-columns:1fr;padding:20px}.norte .val{font-size:44px}.lin{grid-template-columns:1fr 1fr}.lin>:first-child{grid-column:1/-1}.apoio{grid-template-columns:1fr 1fr}.ap{border-bottom:1px solid var(--nl-gray-border)}}
`;

const STATUS: Record<StatusMeta, ["ok" | "att" | "bad", string]> = {
  na_meta: ["ok", "Na meta"],
  atencao: ["att", "Atenção"],
  abaixo: ["bad", "Abaixo da meta"],
};

function dica(def: string, fonte: string): string {
  return `<button class="hint" type="button" aria-label="Definição e fonte">?<span class="tip">${esc(def)}<br><br>Fonte: ${esc(fonte)}</span></button>`;
}

function rotuloMeta(m: Meta): string {
  return `${esc(m.rotulo)}<i class="prov">${m.provisoria ? `provisória, revisão em ${esc(REVISAO_METAS)}` : "meta definida"}</i>`;
}

export function renderKpis(d: DadosKpis): string {
  const aviso = d.desatualizado
    ? `<div class="aviso" role="status">Mostrando dados de ${d.calculadoEm ? esc(d.calculadoEm) + " (UTC)" : "data desconhecida"}: a atualização de hoje não chegou. Os valores não foram zerados.</div>`
    : "";

  let norte: string;
  if (!d.qualidade.disponivel) {
    norte = `<section class="norte" aria-label="KPI-norte">
  <div>
    <div class="lbl">KPI-norte · ganhos por 100 leads novos</div>
    <div class="indisp">Indisponível por ora</div>
    <p style="font-size:13px;max-width:52ch">${esc(d.qualidade.motivo ?? "dado de leads insuficiente")}. O número só será publicado quando o dado de entrada for confiável, para não mostrar uma taxa que parece certa e não é.</p>
  </div>
  <div style="font-size:13px">Leads válidos: ${d.qualidade.pctValidas === null ? "—" : Math.round(d.qualidade.pctValidas) + "%"} · com negócio no CRM: ${d.qualidade.pctCasam === null ? "—" : Math.round(d.qualidade.pctCasam) + "%"}</div>
</section>`;
  } else {
    const max = Math.max(1, ...d.serie.map((c) => c.por100 ?? 0));
    const barras = d.serie
      .map((c) => {
        const h = c.por100 === null ? 6 : Math.max(6, (c.por100 / max) * 100);
        const atual = d.fechada && c.inicio === d.fechada.inicio ? " atual" : "";
        return `<div class="b${atual}${c.parcial ? " parcial" : ""}" style="height:${h}%" title="Semana de ${esc(c.inicio)}: ${c.por100 === null ? "amostra pequena" : c.por100.toFixed(1)}${c.parcial ? " (parcial)" : ""}"></div>`;
      })
      .join("");
    const val = d.fechada && d.fechada.por100 !== null ? d.fechada.por100.toFixed(1).replace(".", ",") : "—";
    const varTxt =
      d.fechada && d.anterior && d.fechada.por100 !== null && d.anterior.por100 !== null
        ? `Semana anterior: ${d.anterior.por100.toFixed(1).replace(".", ",")} · variação ${d.fechada.por100 - d.anterior.por100 >= 0 ? "+" : ""}${(d.fechada.por100 - d.anterior.por100).toFixed(1).replace(".", ",")}`
        : "Sem a semana imediatamente anterior para comparar";
    norte = `<section class="norte" aria-label="KPI-norte">
  <div>
    <div class="lbl">KPI-norte · coorte fechada mais recente (aproximação)</div>
    <div class="val num">${val}<small>ganhos por 100 leads</small></div>
    <p style="font-size:13px;max-width:46ch">Quantos negócios viram venda em até 30 dias a cada 100 leads novos roteados. Aproximação: usa o último movimento do negócio como data de ganho. ${dica("Lead novo = lead roteado pela primeira vez. Ganho = negócio ganho do pipeline de vendas com último movimento em até 30 dias do roteamento.", "log_roteamento e negocios do D1")}</p>
    <div style="font-size:13px;font-weight:700">${esc(varTxt)}</div>
  </div>
  <div><div class="serie" role="img" aria-label="Série de coortes semanais">${barras}</div>
  <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px"><span>Mais antiga</span><span>Tracejada = parcial (ainda sem 30 dias)</span></div></div>
</section>`;
  }

  const r = d.resolucao;
  const stR = r.status ? STATUS[r.status] : (["peq", "Sem funil ativo"] as ["peq", string]);
  const emColeta = (nome: string, chave: ChaveMeta, def: string, fonte: string) =>
    `<div class="lin"><div><b>${esc(nome)}</b>${dica(def, fonte)}</div><div class="v num">—</div><div style="font-size:13px;color:var(--nl-text-muted)">${rotuloMeta(d.metas[chave])}</div><div>${chip("peq", "Em coleta")}</div></div>`;

  return `<style>${CSS_KPIS}</style>
<div class="titulo"><h2>NL Sales KPIs</h2><p>Coortes semanais de 30 dias · somente leitura</p></div>
${aviso}
${norte}
<h3 class="sec">As 4 obsessões</h3>
<div class="tabela">
  <div class="lin"><div><b>Resolução do funil</b>${dica("Negócios do funil ativo (fora de Frio) que viraram ganho ou perdido. Os abertos de qualquer idade entram no denominador; ganhos e perdidos, os dos últimos 60 dias. Inconsistentes contam como não resolvidos.", "negocios do D1, pipeline Vendas Nobre Lar")}</div>
    <div class="v num">${r.valor === null ? "—" : r.valor.toFixed(1).replace(".", ",") + "%"}</div>
    <div style="font-size:13px;color:var(--nl-text-muted)">${rotuloMeta(d.metas.resolucao)}</div>
    <div>${chip(stR[0], stR[1])}</div></div>
  ${emColeta("Orçamento → fechamento", "orcamentoFechamento", "Orçamentos da coorte que viram venda em até 30 dias. Depende do histórico de etapas, que começa a ser guardado com o snapshot diário.", "negocios_snapshot do D1")}
  ${emColeta("Retorno do follow-up", "retornoFollowup", "Leads que entraram na lista de follow-up urgente e responderam ou avançaram em 7 dias. Depende de registrar quem entra na lista.", "tag Follow-up urgente (Plano B)")}
  ${emColeta("Passagem atendida em 30 min", "passagem30min", "Passagens do agente para o vendedor com a primeira mensagem humana em até 30 min de horário comercial. Depende de ler as mensagens das conversas.", "mensagens do CRM (Plano B)")}
</div>
<h3 class="sec">Apoio e limpeza do funil</h3>
<div class="apoio">
  <div class="ap"><div class="l">Candidatos à baixa</div><div class="n num">${d.candidatos.total}</div><div style="font-size:12.5px;color:var(--nl-text-muted)">${d.candidatos.parados} parados há mais de 30 dias · ${d.candidatos.inconsistentes} inconsistentes · ${d.candidatos.semData} sem data</div></div>
  <div class="ap"><div class="l">Em atendimento parados há mais de 7 dias</div><div class="n num">${d.parados7d}</div></div>
  <div class="ap"><div class="l">Leads sem vendedor (24 h)</div><div class="n num">${d.semVendedor ? d.semVendedor.semAtendente : "—"}</div><div style="font-size:12.5px;color:var(--nl-text-muted)">${d.semVendedor ? "de " + d.semVendedor.novos + " novos" : "sem leitura"}</div></div>
  <div class="ap"><div class="l">Erros do agente ao cliente</div><div class="n">—</div><div style="font-size:12.5px;color:var(--nl-text-muted)">em coleta (Plano B)</div></div>
</div>
<p style="font-size:12px;color:var(--nl-text-muted)">Fonte: CRM Data Crazy (somente leitura), sincronizado em ${d.calculadoEm ? esc(d.calculadoEm) + " (UTC)" : "data desconhecida"}.</p>`;
}
