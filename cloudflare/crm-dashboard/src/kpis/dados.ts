import type { ScoreVendedor } from "./ranking";
import type { LeadsRecebidos } from "./distribuicao";
import type { CoorteSemana } from "./norte";
import type { NegocioAberto } from "./candidatos-baixa";
import type { ContagemLeads } from "./qualidade";
import type { Meta } from "./metas";

export const JANELA_DIAS = 60;
export const PIPELINE_VENDAS = "Vendas Nobre Lar";
export const PIPELINE_B2B = "Prospecção B2B";

// Todas as comparações de data passam por datetime(): last_moved_at vem em ISO com T e Z,
// roteado_em em "AAAA-MM-DD HH:MM:SS"; comparar texto cru erra no mesmo dia.

export async function carregarScores(db: D1Database): Promise<ScoreVendedor[]> {
  const r = await db
    .prepare(
      `SELECT user_id, nome, resolvidos, taxa_resolucao, taxa_ganho_suavizada,
              mediana_minutos_resposta, score_velocidade, score_resolucao, score_ganho,
              score_final, calculado_em
       FROM pontuacao_vendedores`
    )
    .all();
  return r.results as unknown as ScoreVendedor[];
}

export async function carregarNomes(db: D1Database): Promise<Map<string, string>> {
  const r = await db.prepare(`SELECT user_id, nome FROM atendentes`).all();
  return new Map((r.results as unknown as { user_id: string; nome: string }[]).map((x) => [x.user_id, x.nome]));
}

// Funil de um pipeline: TODOS os abertos, de qualquer idade (para os parados antigos não
// saírem do denominador), mais os ganhos e perdidos movidos nos últimos 60 dias.
export async function carregarLinhasFunil(db: D1Database, pipeline: string) {
  const r = await db
    .prepare(
      `SELECT attendant_user_id AS vendedor_id, status, etapa
       FROM negocios
       WHERE pipeline_nome = ?1
         AND (status = 'in_process' OR datetime(last_moved_at) >= datetime('now', ?2))`
    )
    .bind(pipeline, `-${JANELA_DIAS} days`)
    .all();
  return r.results as unknown as { vendedor_id: string | null; status: string | null; etapa: string | null }[];
}

// Leads recebidos: ids reais contam uma vez; linhas 'agente' (transferência do agente,
// sem id real) contam uma por linha, porque o vendedor de fato recebeu a conversa.
export async function carregarLeadsRecebidos(db: D1Database, dias: 7 | 30 | 60): Promise<LeadsRecebidos[]> {
  const r = await db
    .prepare(
      `SELECT user_id_escolhido AS user_id,
              COUNT(DISTINCT CASE WHEN lead_id <> 'agente' THEN lead_id END)
                + COALESCE(SUM(CASE WHEN lead_id = 'agente' THEN 1 ELSE 0 END), 0) AS n,
              MAX(roteado_em) AS ultimo
       FROM log_roteamento
       WHERE roteado_em >= datetime('now', ?1) AND COALESCE(lead_id, '') NOT LIKE 'teste-%'
       GROUP BY user_id_escolhido`
    )
    .bind(`-${dias} days`)
    .all();
  return r.results as unknown as LeadsRecebidos[];
}

// Último lead de todos os tempos, para "fora da distribuição" não depender da janela.
export async function carregarUltimoLeadPorVendedor(db: D1Database): Promise<Map<string, string>> {
  const r = await db
    .prepare(
      `SELECT user_id_escolhido AS user_id, MAX(roteado_em) AS ultimo
       FROM log_roteamento WHERE COALESCE(lead_id, '') NOT LIKE 'teste-%' GROUP BY user_id_escolhido`
    )
    .all();
  return new Map((r.results as unknown as { user_id: string; ultimo: string }[]).map((x) => [x.user_id, x.ultimo]));
}

// Qualidade do dado que alimenta o KPI-norte (janela de 8 semanas).
export async function carregarContagemLeads(db: D1Database): Promise<ContagemLeads> {
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN r.lead_id IS NOT NULL AND r.lead_id <> 'agente' THEN 1 ELSE 0 END), 0) AS validas,
              COALESCE(SUM(CASE WHEN r.lead_id IS NOT NULL AND r.lead_id <> 'agente'
                                 AND r.lead_id IN (SELECT lead_id FROM negocios) THEN 1 ELSE 0 END), 0) AS casam
       FROM log_roteamento r
       WHERE r.roteado_em >= datetime('now', '-56 days') AND COALESCE(r.lead_id, '') NOT LIKE 'teste-%'`
    )
    .first<ContagemLeads>();
  return r ?? { total: 0, validas: 0, casam: 0 };
}

// Coortes semanais: um lead conta uma única vez, na semana do primeiro roteamento.
// Ganho = negócio won do pipeline de vendas com último movimento entre o roteamento e +30 dias.
// Segunda-feira da semana: date(x, '-6 days', 'weekday 1').
export async function carregarCoortes(db: D1Database): Promise<CoorteSemana[]> {
  const r = await db
    .prepare(
      `SELECT date(f.roteado_em, '-6 days', 'weekday 1') AS inicio,
              COUNT(*) AS leads,
              SUM(CASE WHEN EXISTS (
                    SELECT 1 FROM negocios n
                    WHERE n.lead_id = f.lead_id AND n.pipeline_nome = ?1 AND n.status = 'won'
                      AND datetime(n.last_moved_at) >= datetime(f.roteado_em)
                      AND datetime(n.last_moved_at) <= datetime(f.roteado_em, '+30 days')
                  ) THEN 1 ELSE 0 END) AS ganhos
       FROM (SELECT lead_id, MIN(roteado_em) AS roteado_em
             FROM log_roteamento
             WHERE lead_id IS NOT NULL AND lead_id <> 'agente' AND lead_id NOT LIKE 'teste-%'
             GROUP BY lead_id) f
       WHERE datetime(f.roteado_em) >= datetime('now', '-98 days')
       GROUP BY inicio ORDER BY inicio`
    )
    .bind(PIPELINE_VENDAS)
    .all();
  return r.results as unknown as CoorteSemana[];
}

export async function carregarAbertos(db: D1Database): Promise<NegocioAberto[]> {
  const r = await db
    .prepare(
      `SELECT n.id, n.codigo, COALESCE(a.nome, 'sem vendedor') AS vendedor, n.etapa, n.status, n.last_moved_at
       FROM negocios n LEFT JOIN atendentes a ON a.user_id = n.attendant_user_id
       WHERE n.pipeline_nome = ?1 AND n.status = 'in_process'`
    )
    .bind(PIPELINE_VENDAS)
    .all();
  return r.results as unknown as NegocioAberto[];
}

// MIN, não MAX: uma sincronização parcial precisa aparecer como dado antigo.
export async function carregarSincronizacoes(db: D1Database): Promise<{ negocios: string | null; scores: string | null }> {
  const a = await db.prepare(`SELECT MIN(synced_at) AS m FROM negocios`).first<{ m: string | null }>();
  const b = await db.prepare(`SELECT MIN(calculado_em) AS m FROM pontuacao_vendedores`).first<{ m: string | null }>();
  return { negocios: a?.m ?? null, scores: b?.m ?? null };
}

export interface SaudeRoteamentoDia {
  data: string;
  novos_leads_24h: number;
  sem_atendente_24h: number;
  roteados_24h: number;
  saudavel: number;
}

export async function carregarSaude(db: D1Database): Promise<SaudeRoteamentoDia | null> {
  return db
    .prepare(
      `SELECT data, novos_leads_24h, sem_atendente_24h, roteados_24h, saudavel
       FROM saude_roteamento ORDER BY data DESC LIMIT 1`
    )
    .first<SaudeRoteamentoDia>();
}

export async function carregarMetas(db: D1Database): Promise<Partial<Meta>[]> {
  try {
    const r = await db
      .prepare(`SELECT chave, na_meta AS naMeta, atencao, provisoria, rotulo FROM kpi_metas`)
      .all();
    return (r.results as unknown as { chave: string; naMeta: number; atencao: number; provisoria: number; rotulo: string }[]).map(
      (m) => ({ ...m, provisoria: m.provisoria === 1 }) as Partial<Meta>
    );
  } catch {
    return []; // tabela ainda não criada: valem os padrões
  }
}

// Snapshot só se o sync do dia aconteceu (negocios mais antiga que 24 h não vira "do dia").
export async function gravarSnapshot(db: D1Database): Promise<number> {
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO negocios_snapshot (dia, negocio_id, etapa, status, attendant_user_id)
       SELECT date('now'), id, etapa, status, attendant_user_id FROM negocios
       WHERE (SELECT MIN(synced_at) FROM negocios) >= datetime('now', '-24 hours')`
    )
    .run();
  await db.prepare(`DELETE FROM negocios_snapshot WHERE dia < date('now', '-400 days')`).run();
  return r.meta.changes;
}
