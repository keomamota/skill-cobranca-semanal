import { DataCrazyClient } from "./datacrazy-client";
import { rotearKpis } from "./kpis/rotas";
import { esc } from "./views/layout";
import { gravarSnapshot } from "./kpis/dados";

export interface Env {
  DB: D1Database;
  AUTH_USER: string;
  AUTH_PASSWORD: string;
  DATACRAZY_API_TOKEN: string;
  SAUDE_TOKEN: string;
  ROUTER: Fetcher;
}

function checkAuth(request: Request, env: Env): boolean {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return false; // cabeçalho malformado: 401, não 500
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return user === env.AUTH_USER && pass === env.AUTH_PASSWORD;
}

function unauthorized(): Response {
  return new Response("Autenticação necessária", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Nobre Lar CRM Dashboard"' },
  });
}

// -----------------------------------------------------------------------
// Dados — placar, negócios parados, variância de roteamento (snapshot D1)
// -----------------------------------------------------------------------

interface Vendedor {
  user_id: string;
  nome: string;
  resolvidos: number;
  taxa_resolucao: number;
  taxa_ganho_suavizada: number;
  mediana_minutos_resposta: number | null;
  score_velocidade: number;
  score_resolucao: number;
  score_ganho: number;
  score_final: number;
  elegivel: number;
}

interface ParadoPorVendedor {
  user_id: string;
  alerta_30_89: number;
  critico_90_mais: number;
}

interface RoteadoPorVendedor {
  user_id: string;
  n_24h: number;
  n_7d: number;
}

async function carregarDados(env: Env) {
  const vendedores = (
    await env.DB.prepare(
      `SELECT user_id, nome, resolvidos, taxa_resolucao, taxa_ganho_suavizada,
              mediana_minutos_resposta, score_velocidade, score_resolucao, score_ganho,
              score_final, elegivel
       FROM pontuacao_vendedores ORDER BY score_final DESC`
    ).all()
  ).results as unknown as Vendedor[];

  const parados = (
    await env.DB.prepare(
      `SELECT attendant_user_id as user_id,
              SUM(CASE WHEN last_moved_at < datetime('now','-30 days') AND last_moved_at >= datetime('now','-90 days') THEN 1 ELSE 0 END) as alerta_30_89,
              SUM(CASE WHEN last_moved_at < datetime('now','-90 days') THEN 1 ELSE 0 END) as critico_90_mais
       FROM negocios
       WHERE status = 'in_process' AND last_moved_at IS NOT NULL
       GROUP BY attendant_user_id`
    ).all()
  ).results as unknown as ParadoPorVendedor[];

  const roteamento = (
    await env.DB.prepare(
      `SELECT user_id_escolhido as user_id,
              SUM(CASE WHEN roteado_em >= datetime('now','-1 day') THEN 1 ELSE 0 END) as n_24h,
              SUM(CASE WHEN roteado_em >= datetime('now','-7 days') THEN 1 ELSE 0 END) as n_7d
       FROM log_roteamento
       WHERE motivo NOT LIKE 'reserva fixa%'
       GROUP BY user_id_escolhido`
    ).all()
  ).results as unknown as RoteadoPorVendedor[];

  const totalParados = (
    await env.DB.prepare(
      `SELECT
        SUM(CASE WHEN last_moved_at < datetime('now','-30 days') AND last_moved_at >= datetime('now','-90 days') THEN 1 ELSE 0 END) as alerta,
        SUM(CASE WHEN last_moved_at < datetime('now','-90 days') THEN 1 ELSE 0 END) as critico
       FROM negocios WHERE status = 'in_process' AND last_moved_at IS NOT NULL`
    ).first()
  ) as { alerta: number; critico: number } | null;

  // Variância de roteamento (só entre o sorteio por mérito, fora da reserva fixa)
  const contagens7d = roteamento.map((r) => r.n_7d).filter((n) => n > 0);
  let variancia: number | null = null;
  if (contagens7d.length >= 2) {
    const max = Math.max(...contagens7d);
    const min = Math.min(...contagens7d);
    variancia = max > 0 ? ((max - min) / max) * 100 : 0;
  }

  return { vendedores, parados, roteamento, totalParados, variancia };
}

// -----------------------------------------------------------------------
// Saúde do roteamento — checa ao vivo (via vendedores-router) se a automação
// "Novo Lead" do Data Crazy está de fato atribuindo vendedor pra todo lead
// novo. Achado real em 2026-08-31: 16/23 leads ficaram 8h+ sem atendente.
// -----------------------------------------------------------------------

interface SaudeRoteamento {
  novosLeads24h: number;
  semAtendente24h: number;
  roteados24h: number;
  saudavel: boolean;
  leadsSemAtendente: { nome: string; leadId: string; desde: string }[];
}

async function checarSaudeRoteamento(env: Env): Promise<SaudeRoteamento | null> {
  try {
    const res = await env.ROUTER.fetch("https://router-interno/saude", {
      headers: { Authorization: `Bearer ${env.SAUDE_TOKEN}` },
    });
    if (!res.ok) {
      console.error("checarSaudeRoteamento: resposta não-ok", res.status, await res.text());
      return null;
    }
    return (await res.json()) as SaudeRoteamento;
  } catch (e) {
    console.error("checarSaudeRoteamento: erro", e);
    return null;
  }
}

// -----------------------------------------------------------------------
// Tempos de atendimento — primeiro atendimento, fechamento, negociação
// (filtro por data + vendedor ou total da loja). Fechamento e negociação só
// têm dado a partir de 2026-08-27 (ver leads_metadata em vendedores-router).
// -----------------------------------------------------------------------

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function carregarTempos(env: Env, de: string, ate: string, vendedorId: string | null) {
  const desde = `${de}T00:00:00.000Z`;
  const ateIso = `${ate}T23:59:59.999Z`;
  const filtroVendedor = vendedorId ? " AND attendant_user_id = ?" : "";

  const atendimentoRows = (
    await env.DB.prepare(
      `SELECT minutos_ate_resposta as v FROM conversas_tempo_resposta
       WHERE primeira_mensagem_cliente_em >= ? AND primeira_mensagem_cliente_em <= ?
         AND minutos_ate_resposta IS NOT NULL${filtroVendedor}`
    )
      .bind(...(vendedorId ? [desde, ateIso, vendedorId] : [desde, ateIso]))
      .all()
  ).results as unknown as { v: number }[];

  const fechamentoRows = (
    await env.DB.prepare(
      `SELECT (julianday(n.last_moved_at) - julianday(lm.criado_em)) as v
       FROM negocios n JOIN leads_metadata lm ON n.lead_id = lm.lead_id
       WHERE n.status = 'won' AND n.last_moved_at >= ? AND n.last_moved_at <= ?${
         vendedorId ? " AND n.attendant_user_id = ?" : ""
       }`
    )
      .bind(...(vendedorId ? [desde, ateIso, vendedorId] : [desde, ateIso]))
      .all()
  ).results as unknown as { v: number }[];

  const negociacaoRows = (
    await env.DB.prepare(
      `SELECT (julianday(n.last_moved_at) - julianday(c.primeira_resposta_atendente_em)) as v
       FROM negocios n JOIN conversas_tempo_resposta c ON n.lead_id = c.lead_id
       WHERE n.status = 'won' AND n.last_moved_at >= ? AND n.last_moved_at <= ?
         AND c.primeira_resposta_atendente_em IS NOT NULL${
           vendedorId ? " AND n.attendant_user_id = ?" : ""
         }`
    )
      .bind(...(vendedorId ? [desde, ateIso, vendedorId] : [desde, ateIso]))
      .all()
  ).results as unknown as { v: number }[];

  return {
    primeiroAtendimentoMin: median(atendimentoRows.map((r) => r.v)),
    primeiroAtendimentoN: atendimentoRows.length,
    fechamentoDias: median(fechamentoRows.map((r) => r.v)),
    fechamentoN: fechamentoRows.length,
    negociacaoDias: median(negociacaoRows.map((r) => r.v)),
    negociacaoN: negociacaoRows.length,
  };
}

// -----------------------------------------------------------------------
// Atividade recente ao vivo — consulta o Data Crazy na hora (não o D1)
// -----------------------------------------------------------------------

async function atividadeRecente(env: Env) {
  const rows = (
    await env.DB.prepare(
      `SELECT lr.lead_id, lr.user_id_escolhido, lr.motivo, lr.roteado_em, a.nome as vendedor_nome
       FROM log_roteamento lr
       LEFT JOIN atendentes a ON a.user_id = lr.user_id_escolhido
       WHERE lr.roteado_em >= datetime('now','-1 day') AND lr.lead_id NOT LIKE 'teste-%'
       ORDER BY lr.roteado_em DESC LIMIT 30`
    ).all()
  ).results as any[];

  const client = new DataCrazyClient(env.DATACRAZY_API_TOKEN);
  const out = [];

  for (const row of rows) {
    // Transferência do agente grava lead_id = 'agente' (sem id real): não há o que
    // consultar no CRM, e consultar gerava 30 chamadas inúteis por carga.
    if (row.lead_id === "agente") {
      out.push({
        leadId: "agente",
        nomeCliente: "(transferência do agente)",
        vendedor: row.vendedor_nome,
        etapa: "",
        roteadoEm: row.roteado_em,
        respondido: false,
        minutosEspera: null,
      });
      continue;
    }
    let nomeCliente = "";
    let etapa = "";
    try {
      const lead = await client.call("lead_get", { id: row.lead_id });
      nomeCliente = lead.name || "";
      const biz = await client.call("lead_list_businesses", { id: row.lead_id });
      const negocios = biz.data ?? [];
      const primeiro = negocios[0];
      etapa = primeiro?.stageName ?? "";
    } catch {
      // segue sem nome/etapa se der erro
    }

    let respondido = false;
    let minutosEspera: number | null = null;
    try {
      const convs = await client.call("conversation_get_by_lead", { leadId: row.lead_id });
      const lista = Array.isArray(convs) ? convs : convs.data ?? [];
      if (lista.length > 0) {
        const msgs = await client.call("conversation_messages_list", { id: lista[0].id, limit: 20 });
        const ordenadas = (Array.isArray(msgs) ? msgs : []).slice().reverse();
        let primeiraMsgCliente: string | null = null;
        for (const m of ordenadas) {
          if (m.received && !primeiraMsgCliente) {
            primeiraMsgCliente = m.createdAt;
            continue;
          }
          if (primeiraMsgCliente && !m.received && m.attendantName && m.body) {
            respondido = true;
            break;
          }
        }
        if (!respondido && primeiraMsgCliente) {
          minutosEspera = Math.round((Date.now() - new Date(primeiraMsgCliente).getTime()) / 60000);
        }
      }
    } catch {
      // segue sem dado de resposta se der erro
    }

    out.push({
      leadId: row.lead_id,
      nomeCliente,
      vendedor: row.vendedor_nome,
      etapa,
      roteadoEm: row.roteado_em,
      respondido,
      minutosEspera,
    });
  }

  return out;
}

// -----------------------------------------------------------------------
// HTML
// -----------------------------------------------------------------------

function fmtMin(min: number | null): string {
  if (min === null) return "—";
  return `${Math.round(min)} min`;
}

// Faixas de speed-to-lead (LeanData: <5min ~100x mais chance de contato;
// <1h ainda converte bem; acima disso a taxa de fechamento despenca).
function classeVelocidadeResposta(min: number | null): string {
  if (min === null) return "";
  if (min <= 15) return "good";
  if (min <= 60) return "warn";
  return "crit";
}

function renderHTML(data: Awaited<ReturnType<typeof carregarDados>>, saude: SaudeRoteamento | null): string {
  const { vendedores, parados, roteamento, totalParados, variancia } = data;
  const paradosPorId = new Map(parados.map((p) => [p.user_id, p]));
  const roteioPorId = new Map(roteamento.map((r) => [r.user_id, r]));

  const bannerSaude =
    saude && !saude.saudavel
      ? `<div class="alerta-saude">
          <div class="alerta-saude-titulo">⚠ Roteamento de leads pode estar parado</div>
          <div class="alerta-saude-texto">
            ${saude.semAtendente24h} de ${saude.novosLeads24h} leads novos nas últimas 24h estão
            <strong>sem nenhum vendedor atribuído</strong> (só ${saude.roteados24h} passaram pelo roteamento automático).
            Provável causa: a automação "Novo Lead" no Data Crazy parou de chamar o roteador — checar a automação lá.
          </div>
        </div>`
      : "";

  const linhasVendedores = vendedores
    .map((v, i) => {
      const p = paradosPorId.get(v.user_id);
      const r = roteioPorId.get(v.user_id);
      const confChip =
        v.elegivel === 1
          ? `<span class="conf-chip full">total</span>`
          : v.resolvidos >= 5
          ? `<span class="conf-chip partial">${Math.min(100, Math.round((v.resolvidos / 10) * 100))}%</span>`
          : `<span class="conf-chip none">${Math.round((v.resolvidos / 10) * 100)}%</span>`;
      return `
      <div class="row">
        <span class="rank">${i + 1}</span>
        <div class="who"><span class="name">${esc(v.nome)}</span><span class="sub">${v.resolvidos} negócios resolvidos/60d</span></div>
        ${confChip}
        <div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, Math.max(0, v.score_final))}%"></div></div></div>
        <div class="metric metric-${classeVelocidadeResposta(v.mediana_minutos_resposta)}"><span class="v num">${fmtMin(v.mediana_minutos_resposta)}</span></div>
        <div class="metric"><span class="v num">${p ? p.alerta_30_89 + p.critico_90_mais : 0}</span><span class="l">parados</span></div>
        <div class="metric"><span class="v num">${r ? r.n_24h : 0}</span><span class="l">leads/24h</span></div>
      </div>`;
    })
    .join("\n");

  const varianciaTxt =
    variancia === null
      ? "sem dado suficiente ainda"
      : variancia <= 15
      ? `${variancia.toFixed(0)}% — dentro do esperado`
      : `${variancia.toFixed(0)}% — acima do ideal (10-15%)`;
  const varianciaClasse = variancia === null ? "" : variancia <= 15 ? "good" : "warn";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CRM Dashboard — Nobre Lar</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Expanded:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
  :root {
    --bg: #f1efe9; --surface: #ffffff; --surface-2: #e9e5db; --line: #ddd7c9;
    --ink: #211d1a; --ink-soft: #6b6259; --ink-faint: #948a7c;
    --accent: #c1571f; --steel: #3e5c6b;
    --good: #4b7b52; --good-soft: #e1ecdf;
    --warn: #b98a2e; --warn-soft: #f3e6c9;
    --crit: #a8412e; --crit-soft: #f5dcd5;
    --radius: 10px; --shadow: 0 1px 2px rgba(33,29,26,0.06), 0 4px 16px rgba(33,29,26,0.05);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #1c1815; --surface: #24201c; --surface-2: #2c2721; --line: #3a332b;
      --ink: #f1efe9; --ink-soft: #b3a998; --ink-faint: #86796a;
      --accent: #e58444; --steel: #8fb2c2;
      --good: #7bb383; --good-soft: #253425;
      --warn: #d9ae5d; --warn-soft: #3a2f19;
      --crit: #d1806c; --crit-soft: #3c2521;
      --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.35);
    }
  }
  :root[data-theme="dark"] {
    --bg: #1c1815; --surface: #24201c; --surface-2: #2c2721; --line: #3a332b;
    --ink: #f1efe9; --ink-soft: #b3a998; --ink-faint: #86796a;
    --accent: #e58444; --steel: #8fb2c2;
    --good: #7bb383; --good-soft: #253425;
    --warn: #d9ae5d; --warn-soft: #3a2f19;
    --crit: #d1806c; --crit-soft: #3c2521;
    --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.35);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 15px; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 32px 24px 60px; }
  h1, h2 { font-family: "Archivo Expanded", sans-serif; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  .num { font-family: "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; }
  .eyebrow { font-family: "IBM Plex Mono", monospace; font-size: 11.5px; font-weight: 500; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-faint); }
  header.masthead { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; padding-bottom: 20px; border-bottom: 3px solid var(--ink); margin-bottom: 28px; flex-wrap: wrap; }
  header.masthead h1 { font-size: clamp(24px, 4vw, 32px); }
  .refresh-btn { font-family: "IBM Plex Mono", monospace; font-size: 12.5px; font-weight: 600; background: var(--accent); color: #fff; border: none; border-radius: 7px; padding: 9px 16px; cursor: pointer; }
  .refresh-btn:hover { opacity: 0.9; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 34px; }
  .kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 15px 17px; box-shadow: var(--shadow); }
  .kpi .v { font-family: "Archivo Expanded", sans-serif; font-size: 27px; font-weight: 700; line-height: 1; margin-top: 5px; }
  .kpi .d { font-size: 12px; color: var(--ink-soft); margin-top: 5px; }
  .kpi.warn .v { color: var(--warn); } .kpi.crit .v { color: var(--crit); } .kpi.good .v { color: var(--good); }
  section { margin-bottom: 36px; }
  section > .head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
  section > .head h2 { font-size: 19px; }
  section > .head .note { font-size: 12.5px; color: var(--ink-soft); }
  .board { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; overflow-x: auto; }
  .row { display: grid; grid-template-columns: 28px 1.3fr 80px 1.1fr 80px 70px 80px; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--line); min-width: 640px; }
  .row:last-child { border-bottom: none; }
  .row.head-row { background: var(--surface-2); padding: 9px 18px; }
  .row.head-row span { font-family: "IBM Plex Mono", monospace; font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-faint); }
  .rank { font-family: "IBM Plex Mono", monospace; font-size: 12.5px; color: var(--ink-faint); }
  .who .name { font-weight: 600; font-size: 14px; } .who .sub { font-size: 11.5px; color: var(--ink-faint); margin-top: 1px; }
  .bar-track { height: 7px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
  .metric { text-align: right; font-size: 12.5px; } .metric .v { font-weight: 600; } .metric .l { display: block; font-size: 10px; color: var(--ink-faint); }
  .metric-good .v { color: var(--good); } .metric-warn .v { color: var(--warn); } .metric-crit .v { color: var(--crit); }
  .conf-chip { display: inline-block; font-family: "IBM Plex Mono", monospace; font-size: 9.5px; font-weight: 600; padding: 2px 6px; border-radius: 20px; text-align: center; }
  .conf-chip.full { background: var(--good-soft); color: var(--good); }
  .conf-chip.partial { background: var(--warn-soft); color: var(--warn); }
  .conf-chip.none { background: var(--crit-soft); color: var(--crit); }
  .variancia-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  .variancia-card .v { font-family: "Archivo Expanded", sans-serif; font-size: 24px; font-weight: 700; }
  .variancia-card .v.good { color: var(--good); } .variancia-card .v.warn { color: var(--warn); }
  #atividade-lista { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 8px; min-height: 60px; }
  .ativ-item { display: grid; grid-template-columns: 1fr 140px 120px 130px; gap: 12px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 13px; }
  .ativ-item:last-child { border-bottom: none; }
  .ativ-item .cliente { font-weight: 600; }
  .ativ-item .status { font-family: "IBM Plex Mono", monospace; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 20px; text-align: center; }
  .ativ-item .status.ok { background: var(--good-soft); color: var(--good); }
  .ativ-item .status.espera { background: var(--warn-soft); color: var(--warn); }
  .ativ-item .status.critico { background: var(--crit-soft); color: var(--crit); }
  .loading { padding: 20px; text-align: center; color: var(--ink-faint); font-size: 13px; }
  .alerta-saude { background: var(--crit-soft); border: 1px solid var(--crit); border-radius: var(--radius); padding: 14px 18px; margin-bottom: 24px; }
  .alerta-saude-titulo { font-weight: 700; color: var(--crit); font-size: 14px; margin-bottom: 4px; }
  .alerta-saude-texto { font-size: 13px; color: var(--ink); line-height: 1.5; }
  .tabs { display: flex; gap: 4px; margin-bottom: 28px; border-bottom: 1px solid var(--line); }
  .tab-btn { font-family: "IBM Plex Sans", sans-serif; font-size: 14px; font-weight: 600; color: var(--ink-soft); background: none; border: none; padding: 10px 16px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
  .filtros { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; box-shadow: var(--shadow); }
  .filtro-campo { display: flex; flex-direction: column; gap: 5px; }
  .filtro-campo label { font-family: "IBM Plex Mono", monospace; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-faint); }
  .filtro-campo input, .filtro-campo select { font-family: "IBM Plex Sans", sans-serif; font-size: 13.5px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
  .bignums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .bignum { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); }
  .bignum .v { font-family: "Archivo Expanded", sans-serif; font-size: 34px; font-weight: 700; line-height: 1; margin-top: 8px; }
  .bignum .d { font-size: 12px; color: var(--ink-soft); margin-top: 8px; }
  .bignum .n { font-size: 11px; color: var(--ink-faint); margin-top: 3px; }
  @media (max-width: 800px) {
    .bignums { grid-template-columns: 1fr; }
  }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--ink-faint); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  @media (max-width: 800px) {
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .ativ-item { grid-template-columns: 1fr; row-gap: 4px; }
  }
</style>
</head>
<body>
<div class="wrap">

  <header class="masthead">
    <div>
      <div class="eyebrow">Nobre Lar · Comercial</div>
      <h1>CRM Dashboard</h1>
    </div>
    <button class="refresh-btn" onclick="location.reload()">↻ Atualizar</button>
  </header>

  ${bannerSaude}

  <div class="tabs">
    <button class="tab-btn active" id="tab-btn-painel" onclick="mostrarAba('painel')">Painel</button>
    <button class="tab-btn" id="tab-btn-tempos" onclick="mostrarAba('tempos')">Tempos de Atendimento</button>
  </div>

  <div id="tab-painel">
  <div class="kpis">
    <div class="kpi">
      <div class="eyebrow">Vendedores ativos</div>
      <div class="v num">${vendedores.length}</div>
      <div class="d">score recalculado 1x/dia</div>
    </div>
    <div class="kpi warn">
      <div class="eyebrow">Negócios parados 30-89d</div>
      <div class="v num">${totalParados?.alerta ?? 0}</div>
      <div class="d">acompanhar</div>
    </div>
    <div class="kpi crit">
      <div class="eyebrow">Negócios parados 90+d</div>
      <div class="v num">${totalParados?.critico ?? 0}</div>
      <div class="d">ação recomendada</div>
    </div>
    <div class="kpi ${variancia !== null && variancia > 15 ? "warn" : "good"}">
      <div class="eyebrow">Variância de roteamento (7d)</div>
      <div class="v num">${variancia === null ? "—" : variancia.toFixed(0) + "%"}</div>
      <div class="d">meta: 10-15%</div>
    </div>
  </div>

  <section>
    <div class="head">
      <h2>Placar de vendedores</h2>
      <div class="note">Score de mérito, negócios parados e leads recebidos — snapshot do último sync.</div>
    </div>
    <div class="board">
      <div class="row head-row"><span>#</span><span>Vendedor</span><span>Confiança</span><span>Score</span><span>Resposta</span><span>Parados</span><span>Leads/24h</span></div>
      ${linhasVendedores}
    </div>
  </section>

  <section>
    <div class="head"><h2>Atividade recente (últimas 24h)</h2><div class="note">Consulta o Data Crazy ao vivo — clique "Atualizar" pra recarregar.</div></div>
    <div id="atividade-lista"><div class="loading">Carregando…</div></div>
  </section>
  </div>

  <div id="tab-tempos" style="display:none">
    <section>
      <div class="head">
        <h2>Tempos de atendimento</h2>
        <div class="note">Fechamento e negociação só têm dado a partir de 27/08/2026 — sem retroativo.</div>
      </div>
      <div class="filtros">
        <div class="filtro-campo"><label>De</label><input type="date" id="filtro-de"></div>
        <div class="filtro-campo"><label>Até</label><input type="date" id="filtro-ate"></div>
        <div class="filtro-campo">
          <label>Vendedor</label>
          <select id="filtro-vendedor">
            <option value="total">Total da loja</option>
            ${vendedores.map((v) => `<option value="${esc(v.user_id)}">${esc(v.nome)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="bignums" id="bignums">
        <div class="bignum">
          <div class="eyebrow">Primeiro atendimento</div>
          <div class="v num" id="bn-atendimento">—</div>
          <div class="d">lead escreve → primeira resposta humana</div>
          <div class="n" id="bn-atendimento-n"></div>
        </div>
        <div class="bignum">
          <div class="eyebrow">Fechamento</div>
          <div class="v num" id="bn-fechamento">—</div>
          <div class="d">lead criado → marcado como ganho</div>
          <div class="n" id="bn-fechamento-n"></div>
        </div>
        <div class="bignum">
          <div class="eyebrow">Negociação</div>
          <div class="v num" id="bn-negociacao">—</div>
          <div class="d">primeira resposta → marcado como ganho</div>
          <div class="n" id="bn-negociacao-n"></div>
        </div>
      </div>
    </section>
  </div>

  <footer>
    <span>Placar e negócios parados: snapshot do banco (sync 1x/dia). Atividade recente: consulta ao vivo.</span>
    <span>Nobre Lar Home Center · Crateús-CE</span>
  </footer>

</div>
<script>
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
async function carregarAtividade() {
  const el = document.getElementById('atividade-lista');
  try {
    const res = await fetch('/api/atividade-recente');
    const dados = await res.json();
    if (!dados.length) {
      el.innerHTML = '<div class="loading">Nenhum lead roteado nas últimas 24h.</div>';
      return;
    }
    el.innerHTML = dados.map(function(d) {
      var statusClass = d.respondido ? 'ok' : (d.minutosEspera && d.minutosEspera > 60 ? 'critico' : 'espera');
      var statusTxt = d.respondido ? 'Respondido' : (d.minutosEspera !== null ? d.minutosEspera + ' min esperando' : 'Aguardando');
      var roteado = new Date(d.roteadoEm.replace(' ', 'T') + 'Z');
      var horasAtras = Math.round((Date.now() - roteado.getTime()) / 3600000 * 10) / 10;
      return '<div class="ativ-item">' +
        '<span class="cliente">' + esc(d.nomeCliente || '(sem nome)') + '<br><span style="font-weight:400;color:var(--ink-faint);font-size:11px">' + esc(d.etapa || '') + '</span></span>' +
        '<span>' + esc(d.vendedor || '—') + '</span>' +
        '<span>há ' + horasAtras + 'h</span>' +
        '<span class="status ' + statusClass + '">' + statusTxt + '</span>' +
        '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="loading">Erro ao carregar atividade recente.</div>';
  }
}
carregarAtividade();

function mostrarAba(aba) {
  document.getElementById('tab-painel').style.display = aba === 'painel' ? '' : 'none';
  document.getElementById('tab-tempos').style.display = aba === 'tempos' ? '' : 'none';
  document.getElementById('tab-btn-painel').classList.toggle('active', aba === 'painel');
  document.getElementById('tab-btn-tempos').classList.toggle('active', aba === 'tempos');
  if (aba === 'tempos') carregarTempos();
}

function fmtDiasCliente(dias) {
  if (dias === null || dias === undefined) return '—';
  if (dias < 1) return Math.round(dias * 24) + 'h';
  return dias.toFixed(1) + 'd';
}

function fmtMinCliente(min) {
  if (min === null || min === undefined) return '—';
  return Math.round(min) + ' min';
}

async function carregarTempos() {
  const de = document.getElementById('filtro-de').value;
  const ate = document.getElementById('filtro-ate').value;
  const vendedor = document.getElementById('filtro-vendedor').value;
  try {
    const res = await fetch('/api/tempos?de=' + de + '&ate=' + ate + '&vendedor=' + encodeURIComponent(vendedor));
    const d = await res.json();
    document.getElementById('bn-atendimento').textContent = fmtMinCliente(d.primeiroAtendimentoMin);
    document.getElementById('bn-atendimento-n').textContent = d.primeiroAtendimentoN + ' atendimento(s) no período';
    document.getElementById('bn-fechamento').textContent = fmtDiasCliente(d.fechamentoDias);
    document.getElementById('bn-fechamento-n').textContent = d.fechamentoN + ' venda(s) fechada(s) no período';
    document.getElementById('bn-negociacao').textContent = fmtDiasCliente(d.negociacaoDias);
    document.getElementById('bn-negociacao-n').textContent = d.negociacaoN + ' venda(s) com dado completo';
  } catch (e) {
    document.getElementById('bn-atendimento').textContent = '—';
    document.getElementById('bn-fechamento').textContent = '—';
    document.getElementById('bn-negociacao').textContent = '—';
  }
}

(function initFiltros() {
  const hoje = new Date();
  const trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  document.getElementById('filtro-de').value = fmt(trintaDiasAtras);
  document.getElementById('filtro-ate').value = fmt(hoje);
  document.getElementById('filtro-de').addEventListener('change', carregarTempos);
  document.getElementById('filtro-ate').addEventListener('change', carregarTempos);
  document.getElementById('filtro-vendedor').addEventListener('change', carregarTempos);
})();
</script>
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!checkAuth(request, env)) return unauthorized();

    const url = new URL(request.url);

    const respostaKpis = await rotearKpis(url, env);
    if (respostaKpis) return respostaKpis;

    if (url.pathname === "/api/atividade-recente") {
      const dados = await atividadeRecente(env);
      return new Response(JSON.stringify(dados), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/api/tempos") {
      const de = url.searchParams.get("de");
      const ate = url.searchParams.get("ate");
      const vendedor = url.searchParams.get("vendedor");
      if (!de || !ate) return new Response("Parâmetros de e ate são obrigatórios", { status: 400 });
      const dados = await carregarTempos(env, de, ate, vendedor === "total" ? null : vendedor);
      return new Response(JSON.stringify(dados), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/") {
      const dados = await carregarDados(env);
      const saude = await checarSaudeRoteamento(env);
      return new Response(renderHTML(dados, saude), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    try {
      await gravarSnapshot(env.DB);
    } catch (e) {
      console.error("snapshot diario falhou", e);
    }
  },
};
