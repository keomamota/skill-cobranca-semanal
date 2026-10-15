import { classificarNegocio, resumirFunil, somarFunis, taxaResolucao } from "./funil";
import { participacao } from "./distribuicao";
import { montarRanking } from "./ranking";
import { exibirCoortes, coorteFechadaMaisRecente, coorteSemanaAnterior } from "./norte";
import { statusMeta, mesclarMetas } from "./metas";
import { desatualizado, maisAntiga } from "./frescor";
import { candidatosBaixa, respostaCandidatos } from "./candidatos-baixa";
import { avaliarQualidadeLeads } from "./qualidade";
import { horasDesde } from "./datas";
import { REGRA_EM_VIGOR } from "./regra-distribuicao";
import {
  PIPELINE_VENDAS, PIPELINE_B2B, carregarScores, carregarNomes, carregarLinhasFunil, carregarLeadsRecebidos,
  carregarUltimoLeadPorVendedor, carregarContagemLeads, carregarCoortes, carregarAbertos,
  carregarSincronizacoes, carregarSaude, carregarMetas,
} from "./dados";
import { renderShell } from "../views/layout";
import { renderVendedores, CSS_VENDEDORES } from "../views/vendedores";
import { renderKpis, CSS_KPIS } from "../views/kpis";

export interface EnvKpis {
  DB: D1Database;
}

const CABECALHOS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  // As telas novas não têm script: nada de script em linha ou externo.
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
};

function html(corpo: string): Response {
  return new Response(corpo, { headers: CABECALHOS });
}

export async function rotearKpis(url: URL, env: EnvKpis, agora = new Date()): Promise<Response | null> {
  if (url.pathname === "/kpis/vendedores") return vendedores(url, env, agora);
  if (url.pathname === "/kpis") return kpis(env, agora);
  if (url.pathname === "/api/kpis/candidatos-baixa") {
    const c = candidatosBaixa(await carregarAbertos(env.DB), agora);
    return Response.json(respostaCandidatos(c, 500));
  }
  return null;
}

async function vendedores(url: URL, env: EnvKpis, agora: Date): Promise<Response> {
  const dias = ([7, 30, 60] as const).find((d) => String(d) === url.searchParams.get("dias")) ?? 60;
  const [scores, vendas, b2b, leads, ultimos, nomes, saude, sync] = await Promise.all([
    carregarScores(env.DB),
    carregarLinhasFunil(env.DB, PIPELINE_VENDAS),
    carregarLinhasFunil(env.DB, PIPELINE_B2B),
    carregarLeadsRecebidos(env.DB, dias),
    carregarUltimoLeadPorVendedor(env.DB),
    carregarNomes(env.DB),
    carregarSaude(env.DB),
    carregarSincronizacoes(env.DB),
  ]);
  const part = participacao(leads, {
    agora,
    cotaDia: REGRA_EM_VIGOR.cotaDia,
    vendedoresAtivos: scores.map((s) => s.user_id),
    ultimoPorVendedor: ultimos,
  });
  const linhas = montarRanking(scores, resumirFunil(vendas), part, nomes);
  const calculadoEm = maisAntiga([sync.scores, sync.negocios]);
  const corpo = renderVendedores({
    linhas,
    b2b: [...resumirFunil(b2b).entries()].map(([id, funil]) => ({ nome: nomes.get(id) ?? "Sem vendedor", funil })),
    totalLeads: leads.reduce((s, l) => s + l.n, 0),
    regra: {
      descricao: REGRA_EM_VIGOR.descricao,
      desde: REGRA_EM_VIGOR.desde,
      cotaConfigurada: Object.keys(REGRA_EM_VIGOR.cotaDia).length > 0,
    },
    calculadoEm,
    desatualizado: desatualizado(calculadoEm, agora),
    janelaLeads: dias,
    semVendedor: saude
      ? { semAtendente: saude.sem_atendente_24h, novos: saude.novos_leads_24h, saudavel: saude.saudavel === 1 }
      : null,
  });
  const selo = calculadoEm ? `Dados de ${calculadoEm.slice(0, 10)}` : "Data do dado desconhecida";
  return html(renderShell({ titulo: "Performance por vendedor — NL Sales", ativo: "vend", selo, conteudo: corpo, css: CSS_VENDEDORES }));
}

async function kpis(env: EnvKpis, agora: Date): Promise<Response> {
  const [vendas, coortes, abertos, contagem, sync, saude, metasD1] = await Promise.all([
    carregarLinhasFunil(env.DB, PIPELINE_VENDAS),
    carregarCoortes(env.DB),
    carregarAbertos(env.DB),
    carregarContagemLeads(env.DB),
    carregarSincronizacoes(env.DB),
    carregarSaude(env.DB),
    carregarMetas(env.DB),
  ]);
  const total = somarFunis(resumirFunil(vendas).values());
  const metas = mesclarMetas(metasD1);
  const valor = taxaResolucao(total);
  const serie = exibirCoortes(coortes, agora);
  const fechada = coorteFechadaMaisRecente(serie);
  const cand = candidatosBaixa(abertos, agora);
  const calculadoEm = maisAntiga([sync.negocios, sync.scores]);
  const corpo = renderKpis({
    qualidade: avaliarQualidadeLeads(contagem),
    fechada,
    anterior: fechada ? coorteSemanaAnterior(serie, fechada) : null,
    serie,
    resolucao: {
      valor,
      status: statusMeta(metas.resolucao, valor),
      resolvidos: total.ganho + total.perdido,
      ativos: total.total - total.frio,
    },
    metas,
    candidatos: {
      total: cand.length,
      inconsistentes: cand.filter((c) => c.motivo === "inconsistente").length,
      parados: cand.filter((c) => c.motivo === "parado_30_dias").length,
      semData: cand.filter((c) => c.motivo === "sem_data").length,
    },
    parados7d: abertos.filter(
      (a) => classificarNegocio(a) === "em_atendimento" && (horasDesde(a.last_moved_at, agora) ?? 0) > 7 * 24
    ).length,
    semVendedor: saude ? { semAtendente: saude.sem_atendente_24h, novos: saude.novos_leads_24h } : null,
    calculadoEm,
    desatualizado: desatualizado(calculadoEm, agora),
  });
  const selo = calculadoEm ? `Dados de ${calculadoEm.slice(0, 10)}` : "Data do dado desconhecida";
  return html(renderShell({ titulo: "NL Sales KPIs", ativo: "kpi", selo, conteudo: corpo, css: CSS_KPIS }));
}
