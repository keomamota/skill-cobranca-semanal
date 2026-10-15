var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/parada.js
var LIMITE_MINUTOS = 30;
var AGENTE = "NL Sales";
var FUSO = "America/Fortaleza";
var EXPEDIENTE_INICIO = 7;
var EXPEDIENTE_FIM = 18;
function horaLocal(data) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    hour: "numeric",
    hourCycle: "h23"
  }).formatToParts(data);
  return Number(partes.find((p) => p.type === "hour").value);
}
__name(horaLocal, "horaLocal");
function dentroDoExpediente(data) {
  const h = horaLocal(data);
  return h >= EXPEDIENTE_INICIO && h < EXPEDIENTE_FIM;
}
__name(dentroDoExpediente, "dentroDoExpediente");
var ehCliente = /* @__PURE__ */ __name((m) => m.received === true, "ehCliente");
var ehHumano = /* @__PURE__ */ __name((m) => m.received === false && !m.isInternal && !!m.attendantName && m.attendantName !== AGENTE, "ehHumano");
var ehAgente = /* @__PURE__ */ __name((m) => m.received === false && !m.isInternal && m.attendantName === AGENTE, "ehAgente");
function decidirParada(mensagens, agora = /* @__PURE__ */ new Date(), limite = LIMITE_MINUTOS) {
  const msgs = (mensagens ?? []).filter((m) => m && !m.deleted && m.createdAt).map((m) => ({ ...m, t: Date.parse(m.createdAt) })).sort((a, b) => a.t - b.t);
  const dentro = dentroDoExpediente(agora);
  const base = {
    dentro_do_expediente: dentro,
    limite_minutos: limite,
    espera_desde: null,
    minutos_sem_resposta: 0,
    ultimo_humano: null
  };
  const ultimoHumano = [...msgs].reverse().find(ehHumano);
  if (ultimoHumano) base.ultimo_humano = ultimoHumano.attendantName;
  if (msgs.length === 0) return { ...base, reatribuir: false, motivo: "sem_mensagens" };
  const ultimaResposta = [...msgs].reverse().find((m) => ehHumano(m) || ehAgente(m));
  const corte = ultimaResposta ? ultimaResposta.t : -Infinity;
  const esperando = msgs.find((m) => ehCliente(m) && m.t > corte);
  if (!esperando) return { ...base, reatribuir: false, motivo: "cliente_nao_esta_esperando" };
  const minutos = (agora.getTime() - esperando.t) / 6e4;
  const out = {
    ...base,
    espera_desde: new Date(esperando.t).toISOString(),
    minutos_sem_resposta: Math.round(minutos * 10) / 10
  };
  if (minutos < limite) return { ...out, reatribuir: false, motivo: "dentro_do_prazo" };
  if (!dentro) return { ...out, reatribuir: false, motivo: "fora_do_expediente" };
  return { ...out, reatribuir: true, motivo: "atendente_demorou" };
}
__name(decidirParada, "decidirParada");

// src/index.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var ENDPOINT = "https://mcp.g1.datacrazy.io/api/mcp";
var DataCrazyError = class extends Error {
  static {
    __name(this, "DataCrazyError");
  }
  static {
    __name2(this, "DataCrazyError");
  }
};
var DataCrazyClient = class {
  static {
    __name(this, "DataCrazyClient");
  }
  constructor(token) {
    this.token = token;
  }
  token;
  static {
    __name2(this, "DataCrazyClient");
  }
  async call(toolName, args = {}) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args }
      })
    });
    if (!res.ok) {
      throw new DataCrazyError(`HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    if (data.error) {
      throw new DataCrazyError(JSON.stringify(data.error));
    }
    const content = data.result?.content?.[0]?.text;
    if (data.result?.isError) {
      throw new DataCrazyError(content ?? "erro desconhecido");
    }
    return JSON.parse(content ?? "null");
  }
  /** business_list_by_attendant pagina em skip/limit — busca tudo. */
  async listBusinessesByAttendant(userId) {
    const all = [];
    let skip = 0;
    const limit = 100;
    for (; ; ) {
      const res = await this.call("business_list_by_attendant", { userId, skip, limit });
      const page = res.data ?? [];
      all.push(...page);
      if (page.length < limit) break;
      skip += limit;
    }
    return all;
  }
  /** business_list_by_stage pagina em skip/limit — busca tudo. */
  async listBusinessesByStage(stageId) {
    const all = [];
    let skip = 0;
    const limit = 100;
    for (; ; ) {
      const res = await this.call("business_list_by_stage", { stageId, skip, limit });
      const page = res.data ?? [];
      all.push(...page);
      if (page.length < limit) break;
      skip += limit;
    }
    return all;
  }
  /** conversation_list pagina em skip/limit. */
  async listConversations(args = {}) {
    const all = [];
    let skip = 0;
    const limit = 100;
    for (; ; ) {
      const res = await this.call("conversation_list", { ...args, skip, limit, status: "all" });
      const page = res.data ?? [];
      all.push(...page);
      if (page.length < limit) break;
      skip += limit;
    }
    return all;
  }
  async listMessages(conversationId, limit = 200) {
    const res = await this.call("conversation_messages_list", { id: conversationId, limit });
    return Array.isArray(res) ? res : [];
  }
  async updateLeadAttendant(leadId, userId) {
    await this.call("lead_update_attendant", { id: leadId, userId });
  }
  /** Le o lead para saber se ele ja tem atendente antes de reatribuir. */
  async getLead(leadId) {
    return this.call("lead_get", { id: leadId });
  }
};
var VENDEDORES_ATIVOS = {
  "Camila Olinda": "o62nkggR28bQTCrxUk5uXkkRSzs2",
  "FRANCISCO MASCILON SOARES": "FUw2J2MCNGd0OYCARQK4sFtJihp2",
  "Geicy Sousa": "Z3I10gOT0kbuWNnQgSCD5Pdmp4a2",
  "Kayllane Soares": "ehKObBrbKWf7hIa8UfdBK272ukt1",
  "Leonardo Oliveira": "bbFv2CoAkBaMI3cVw6gmzDp9Jjd2",
  "wesley KT": "nEnSC239aVVTaZw3Looe50yjUFI2",
  // Incluido para o calculo diario pontua-lo e ele aparecer na ferramenta
  // de desempenho que o agente consulta. Ele NAO entra no sorteio: ja tem
  // a reserva fixa, e somar as duas coisas passaria de 40%.
  "Mikhaell Machado": "UJyOGDl9nTcer761afs8iHsUMlq2"
};
var MIKHAELL_USER_ID = "UJyOGDl9nTcer761afs8iHsUMlq2";
var MIKHAELL_NOME = "Mikhaell Machado";
var DESTINOS_PERMITIDOS = [
  "nEnSC239aVVTaZw3Looe50yjUFI2",
  // wesley KT
  "UJyOGDl9nTcer761afs8iHsUMlq2",
  // Mikhaell Machado
  "Z3I10gOT0kbuWNnQgSCD5Pdmp4a2",
  // Geicy Sousa
  "bbFv2CoAkBaMI3cVw6gmzDp9Jjd2",
  // Leonardo Oliveira
  "FUw2J2MCNGd0OYCARQK4sFtJihp2"
  // FRANCISCO MASCILON SOARES
];
var FATIA_FIXA_MIKHAELL = 0;
var ENFASE_RANKING = 2;
function calcularCotas(elegiveis) {
  const cotas = /* @__PURE__ */ new Map();
  if (elegiveis.length === 0) return cotas;
  const pesos = elegiveis.map((v) => Math.pow(Math.max(v.score_final ?? 0, 0), ENFASE_RANKING));
  const soma = pesos.reduce((s2, p) => s2 + p, 0);
  elegiveis.forEach((v, i) => {
    cotas.set(v.user_id, soma > 0 ? pesos[i] / soma : 1 / elegiveis.length);
  });
  return cotas;
}
__name(calcularCotas, "calcularCotas");
__name2(calcularCotas, "calcularCotas");
var JANELA_DIAS = 60;
var K_SUAVIZACAO = 20;
var MIN_VOLUME_ELEGIVEL = 10;
var INICIO_CAPTURA_TEMPOS = "2026-08-27T00:00:00.000Z";
function median(nums) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
__name(median, "median");
__name2(median, "median");
function norm(v, lo, hi, invert = false) {
  if (hi === lo) return 50;
  const n = (v - lo) / (hi - lo) * 100;
  return invert ? 100 - n : n;
}
__name(norm, "norm");
__name2(norm, "norm");
async function syncNegociosERecalcular(env) {
  const client = new DataCrazyClient(env.DATACRAZY_API_TOKEN);
  const agora = /* @__PURE__ */ new Date();
  const cutoff = new Date(agora.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1e3);
  await env.DB.prepare("DELETE FROM negocios").run();
  const statsPorVendedor = {};
  for (const [nome, userId] of Object.entries(VENDEDORES_ATIVOS)) {
    const negocios = await client.listBusinessesByAttendant(userId);
    let stmt = env.DB.prepare(
      `INSERT INTO negocios (id, codigo, status, etapa, pipeline_id, pipeline_nome, lead_id, attendant_user_id, last_moved_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const batch = negocios.map(
      (b) => stmt.bind(
        b.id,
        b.code ?? null,
        b.status,
        b.stageName ?? null,
        b.pipelineId ?? null,
        b.pipelineName ?? null,
        b.leadId ?? null,
        userId,
        b.lastMovedAt ?? null
      )
    );
    if (batch.length > 0) await env.DB.batch(batch);
    const janela = negocios.filter((b) => b.lastMovedAt && new Date(b.lastMovedAt) >= cutoff);
    statsPorVendedor[nome] = {
      total: janela.length,
      won: janela.filter((b) => b.status === "won").length,
      lost: janela.filter((b) => b.status === "lost").length
    };
    await cachearCriacaoLeadsGanhos(env, client, negocios);
  }
  await recalcularPontuacao(env, statsPorVendedor);
}
__name(syncNegociosERecalcular, "syncNegociosERecalcular");
__name2(syncNegociosERecalcular, "syncNegociosERecalcular");
async function cachearCriacaoLeadsGanhos(env, client, negocios) {
  const ganhos = negocios.filter(
    (b) => b.status === "won" && b.leadId && b.lastMovedAt && b.lastMovedAt >= INICIO_CAPTURA_TEMPOS
  );
  for (const b of ganhos) {
    const jaTemCache = await env.DB.prepare("SELECT 1 FROM leads_metadata WHERE lead_id = ?").bind(b.leadId).first();
    if (jaTemCache) continue;
    try {
      const lead = await client.call("lead_get", { id: b.leadId });
      if (lead?.createdAt) {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO leads_metadata (lead_id, criado_em, cached_em) VALUES (?,?,datetime('now'))"
        ).bind(b.leadId, lead.createdAt).run();
      }
    } catch {
    }
  }
}
__name(cachearCriacaoLeadsGanhos, "cachearCriacaoLeadsGanhos");
__name2(cachearCriacaoLeadsGanhos, "cachearCriacaoLeadsGanhos");
var STAGE_ID_NOVO_LEAD = "1cac31b9-c69e-48fe-b744-9aa8314725e6";
async function checarSaudeRoteamento(env) {
  const client = new DataCrazyClient(env.DATACRAZY_API_TOKEN);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
  const novoLead = await client.listBusinessesByStage(STAGE_ID_NOVO_LEAD);
  const novos24h = novoLead.filter((b) => b.lastMovedAt && b.lastMovedAt >= cutoff);
  const semAtendente = novos24h.filter((b) => !b.attendantName);
  const roteadosRow = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM log_roteamento WHERE roteado_em >= ? AND lead_id NOT LIKE 'teste-%'`
  ).bind(cutoff.replace("T", " ").replace("Z", "")).first();
  const novosLeads24h = novos24h.length;
  const semAtendente24h = semAtendente.length;
  const roteados24h = roteadosRow?.n ?? 0;
  const saudavel = semAtendente24h === 0;
  return {
    novosLeads24h,
    semAtendente24h,
    roteados24h,
    saudavel,
    leadsSemAtendente: semAtendente.map((b) => ({ nome: b.leadName, leadId: b.leadId, desde: b.lastMovedAt }))
  };
}
__name(checarSaudeRoteamento, "checarSaudeRoteamento");
__name2(checarSaudeRoteamento, "checarSaudeRoteamento");
async function gravarSnapshotSaude(env) {
  const saude = await checarSaudeRoteamento(env);
  const hoje = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO saude_roteamento (data, novos_leads_24h, sem_atendente_24h, roteados_24h, saudavel, checado_em)
     VALUES (?,?,?,?,?,datetime('now'))
     ON CONFLICT(data) DO UPDATE SET
       novos_leads_24h = excluded.novos_leads_24h,
       sem_atendente_24h = excluded.sem_atendente_24h,
       roteados_24h = excluded.roteados_24h,
       saudavel = excluded.saudavel,
       checado_em = excluded.checado_em`
  ).bind(hoje, saude.novosLeads24h, saude.semAtendente24h, saude.roteados24h, saude.saudavel ? 1 : 0).run();
  return saude;
}
__name(gravarSnapshotSaude, "gravarSnapshotSaude");
__name2(gravarSnapshotSaude, "gravarSnapshotSaude");
async function recalcularPontuacao(env, statsPorVendedor) {
  const totalWon = Object.values(statsPorVendedor).reduce((s, v) => s + v.won, 0);
  const totalResolved = Object.values(statsPorVendedor).reduce((s, v) => s + v.won + v.lost, 0);
  const mediaGlobalGanho = totalResolved > 0 ? totalWon / totalResolved : 0.5;
  const cutoffTempo = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1e3).toISOString();
  const linhas = [];
  for (const [nome, userId] of Object.entries(VENDEDORES_ATIVOS)) {
    const s = statsPorVendedor[nome] ?? { total: 0, won: 0, lost: 0 };
    const resolvidos = s.won + s.lost;
    const taxaResolucao = s.total > 0 ? resolvidos / s.total : 0;
    const taxaGanhoSuavizada = (s.won + K_SUAVIZACAO * mediaGlobalGanho) / (resolvidos + K_SUAVIZACAO);
    const tempos = await env.DB.prepare(
      `SELECT minutos_ate_resposta FROM conversas_tempo_resposta
       WHERE attendant_user_id = ? AND primeira_mensagem_cliente_em >= ?`
    ).bind(userId, cutoffTempo).all();
    const minutosArr = (tempos.results ?? []).map((r) => r.minutos_ate_resposta);
    const medianaMin = median(minutosArr);
    linhas.push({
      nome,
      userId,
      total: s.total,
      ganhos: s.won,
      perdidos: s.lost,
      resolvidos,
      taxaResolucao,
      taxaGanhoSuavizada,
      medianaMin,
      elegivel: resolvidos >= MIN_VOLUME_ELEGIVEL
    });
  }
  const medianas = linhas.map((l) => l.medianaMin).filter((v) => v !== null);
  const [minT, maxT] = medianas.length ? [Math.min(...medianas), Math.max(...medianas)] : [0, 0];
  const resolucoes = linhas.map((l) => l.taxaResolucao);
  const [minR, maxR] = [Math.min(...resolucoes), Math.max(...resolucoes)];
  const ganhos = linhas.map((l) => l.taxaGanhoSuavizada);
  const [minG, maxG] = [Math.min(...ganhos), Math.max(...ganhos)];
  const volumes = linhas.map((l) => l.resolvidos);
  const [minV, maxV] = [Math.min(...volumes), Math.max(...volumes)];
  await env.DB.prepare("DELETE FROM pontuacao_vendedores").run();
  const stmts = linhas.map((l) => {
    const scoreVelocidade = l.medianaMin !== null ? norm(l.medianaMin, minT, maxT, true) : 50;
    const scoreResolucao = norm(l.taxaResolucao, minR, maxR);
    const scoreGanho = norm(l.taxaGanhoSuavizada, minG, maxG);
    const scoreVolume = norm(l.resolvidos, minV, maxV);
    const scoreBruto = 0.3 * scoreResolucao + 0.3 * scoreVolume + 0.4 * scoreGanho;
    const scoreFinal = scoreBruto;
    return env.DB.prepare(
      `INSERT INTO pontuacao_vendedores
        (user_id, nome, janela_dias, total_negocios, ganhos, perdidos, resolvidos,
         taxa_resolucao, taxa_ganho_suavizada, mediana_minutos_resposta,
         score_velocidade, score_resolucao, score_ganho, score_final, elegivel)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      l.userId,
      l.nome,
      JANELA_DIAS,
      l.total,
      l.ganhos,
      l.perdidos,
      l.resolvidos,
      taxaOuNull(l.taxaResolucao),
      taxaOuNull(l.taxaGanhoSuavizada),
      l.medianaMin,
      scoreVelocidade,
      scoreResolucao,
      scoreGanho,
      scoreFinal,
      l.elegivel ? 1 : 0
    );
  });
  if (stmts.length > 0) await env.DB.batch(stmts);
}
__name(recalcularPontuacao, "recalcularPontuacao");
__name2(recalcularPontuacao, "recalcularPontuacao");
function taxaOuNull(v) {
  return Number.isFinite(v) ? v : 0;
}
__name(taxaOuNull, "taxaOuNull");
__name2(taxaOuNull, "taxaOuNull");
async function syncTemposResposta(env) {
  const client = new DataCrazyClient(env.DATACRAZY_API_TOKEN);
  const cutoff = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1e3);
  const conversas = await client.listConversations({ lastMessageGte: cutoff.toISOString() });
  const porVendedor = {};
  for (const c of conversas) {
    for (const a of c.attendants ?? []) {
      if (a.name in VENDEDORES_ATIVOS) {
        (porVendedor[a.name] ??= []).push(c);
      }
    }
  }
  await env.DB.prepare("DELETE FROM conversas_tempo_resposta").run();
  const MAX_POR_VENDEDOR = 100;
  for (const [nome, userId] of Object.entries(VENDEDORES_ATIVOS)) {
    const lista = (porVendedor[nome] ?? []).slice(0, MAX_POR_VENDEDOR);
    const linhas = [];
    for (const c of lista) {
      let msgs;
      try {
        msgs = await client.listMessages(c.id, 200);
      } catch {
        continue;
      }
      if (msgs.length >= 200) continue;
      msgs = msgs.slice().reverse();
      let primeiraMsgCliente = null;
      let primeiraRespostaHumana = null;
      for (const m of msgs) {
        if (m.received && !primeiraMsgCliente) {
          primeiraMsgCliente = m.createdAt;
          continue;
        }
        if (primeiraMsgCliente && !m.received && m.attendantName && m.body) {
          primeiraRespostaHumana = m.createdAt;
          break;
        }
      }
      if (primeiraMsgCliente && primeiraRespostaHumana) {
        const minutos = (new Date(primeiraRespostaHumana).getTime() - new Date(primeiraMsgCliente).getTime()) / 6e4;
        if (minutos >= 0 && minutos <= 24 * 60) {
          linhas.push({ conversationId: c.id, leadId: c.leadId ?? null, primeiraMsgCliente, primeiraRespostaHumana, minutos });
        }
      }
    }
    if (linhas.length > 0) {
      const stmts = linhas.map(
        (l) => env.DB.prepare(
          `INSERT OR IGNORE INTO conversas_tempo_resposta
            (conversation_id, lead_id, attendant_user_id, primeira_mensagem_cliente_em,
             primeira_resposta_atendente_em, minutos_ate_resposta)
           VALUES (?,?,?,?,?,?)`
        ).bind(l.conversationId, l.leadId, userId, l.primeiraMsgCliente, l.primeiraRespostaHumana, Math.round(l.minutos * 100) / 100)
      );
      await env.DB.batch(stmts);
    }
  }
  const negociosRows = await env.DB.prepare(
    `SELECT attendant_user_id, status, last_moved_at FROM negocios`
  ).all();
  const cutoffIso = cutoff.toISOString();
  const statsPorVendedor = {};
  const userIdToNome = Object.fromEntries(Object.entries(VENDEDORES_ATIVOS).map(([n, u]) => [u, n]));
  for (const row of negociosRows.results ?? []) {
    const nome = userIdToNome[row.attendant_user_id];
    if (!nome || !row.last_moved_at || row.last_moved_at < cutoffIso) continue;
    const s = statsPorVendedor[nome] ??= { total: 0, won: 0, lost: 0 };
    s.total++;
    if (row.status === "won") s.won++;
    if (row.status === "lost") s.lost++;
  }
  await recalcularPontuacao(env, statsPorVendedor);
}
__name(syncTemposResposta, "syncTemposResposta");
__name2(syncTemposResposta, "syncTemposResposta");
async function registrarEscolha(env, leadId, userId, score, motivo) {
  await env.DB.prepare(
    `INSERT INTO log_roteamento (lead_id, user_id_escolhido, score_no_momento, motivo) VALUES (?,?,?,?)`
  ).bind(leadId, userId, score, motivo).run();
}
__name(registrarEscolha, "registrarEscolha");
__name2(registrarEscolha, "registrarEscolha");
async function escolherVendedor(env, leadId, opcoes = {}) {
  if (Math.random() < FATIA_FIXA_MIKHAELL) {
    const motivo2 = `reserva fixa ${Math.round(FATIA_FIXA_MIKHAELL * 100)}% (vendedor digital, sem hist\xF3rico)`;
    await registrarEscolha(env, leadId, MIKHAELL_USER_ID, null, motivo2);
    return { userId: MIKHAELL_USER_ID, nome: MIKHAELL_NOME, motivo: motivo2 };
  }
  const rows = await env.DB.prepare(
    `SELECT user_id, nome, score_final, resolvidos FROM pontuacao_vendedores`
  ).all();
  const todas = (rows.results ?? []).filter(
    (c) => FATIA_FIXA_MIKHAELL <= 0 || c.user_id !== MIKHAELL_USER_ID
  );
  const permitidas = DESTINOS_PERMITIDOS.length ? todas.filter((c) => DESTINOS_PERMITIDOS.includes(c.user_id)) : todas;
  const linhas = permitidas.length > 0 ? permitidas : todas;
  if (linhas.length === 0) {
    const motivo2 = "fallback: nenhum vendedor cadastrado";
    await registrarEscolha(env, leadId, MIKHAELL_USER_ID, null, motivo2);
    return { userId: MIKHAELL_USER_ID, nome: MIKHAELL_NOME, motivo: motivo2 };
  }
  const excluir = opcoes.excluirNomes ?? [];
  const semAtual = linhas.filter((c) => !excluir.includes(c.nome));
  const elegiveis = semAtual.length > 0 ? semAtual : linhas;
  const ordenados = [...elegiveis].sort((a, b) => (b.score_final ?? 0) - (a.score_final ?? 0));
  const cotas = calcularCotas(ordenados);
  let hoje = [];
  try {
    const contagem = await env.DB.prepare(
      `SELECT user_id_escolhido AS user_id, COUNT(*) AS n
         FROM log_roteamento
        WHERE date(roteado_em) = date('now')
        GROUP BY user_id_escolhido`
    ).all();
    hoje = contagem.results ?? [];
  } catch {
    hoje = [];
  }
  const recebidos = new Map(hoje.map((x) => [x.user_id, x.n]));
  const totalHoje = hoje.reduce((s2, x) => s2 + x.n, 0);
  let escolhido = ordenados[0];
  let maiorDeficit = -Infinity;
  for (const c of ordenados) {
    const alvo = (totalHoje + 1) * (cotas.get(c.user_id) ?? 0);
    const deficit = alvo - (recebidos.get(c.user_id) ?? 0);
    if (deficit > maiorDeficit) {
      maiorDeficit = deficit;
      escolhido = c;
    }
  }
  const motivo = opcoes.motivo ?? "cota diaria (roteador)";
  if (opcoes.registrar !== false) {
    await registrarEscolha(env, leadId, escolhido.user_id, escolhido.score_final, motivo);
  }
  return { userId: escolhido.user_id, nome: escolhido.nome, motivo };
}
__name(escolherVendedor, "escolherVendedor");
__name2(escolherVendedor, "escolherVendedor");
var ATENDENTE_MENSAGENS = {
  "6a80bbc89a8ffb88a9ac947f": AGENTE,
  "6a8c1aee1804726eac1d4881": "Mikhaell Machado",
  "699c4a2efda4e38c3012140f": "wesley KT",
  "697b63068929dccc067d7cd6": "Geicy Sousa",
  "697a82fd50553eca7035c39d": "Leonardo Oliveira",
  "6981cb1b41cb20d6e9e6e5bd": "FRANCISCO MASCILON SOARES",
  "697e09068b56c961ba6db265": "Camila Olinda",
  "697b42838d623159cf362d65": "Keoma Mota"
};
var jsonResp = /* @__PURE__ */ __name((obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }), "jsonResp");
async function conversaParada(request, env, url) {
  if (env.ROUTER_BEARER_TOKEN) {
    const auth = request.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${env.ROUTER_BEARER_TOKEN}`) return new Response("Unauthorized", { status: 401 });
  }
  let leadId = url.searchParams.get("leadId");
  if (!leadId && request.method === "POST") {
    leadId = (await request.json().catch(() => ({}))).leadId ?? null;
  }
  if (!leadId) return jsonResp({ reatribuir: false, motivo: "leadId_obrigatorio" }, 400);
  const client = new DataCrazyClient(env.DATACRAZY_API_TOKEN);
  try {
    const convs = await client.call("conversation_get_by_lead", { leadId });
    const conv = (Array.isArray(convs) ? convs : []).filter((c) => !c.isGroup).sort((a, b) => Date.parse(b.lastMessageDate ?? 0) - Date.parse(a.lastMessageDate ?? 0))[0];
    if (!conv) return jsonResp({ reatribuir: false, motivo: "sem_conversa" });
    if (conv.finished) return jsonResp({ reatribuir: false, motivo: "conversa_finalizada", conversa: conv.id });
    const donos = (conv.attendants ?? []).map((a) => ATENDENTE_MENSAGENS[a.id] ?? a.name ?? null);
    if (donos.includes(AGENTE)) {
      return jsonResp({ reatribuir: false, motivo: "conversa_com_o_agente", conversa: conv.id });
    }
    const mensagens = await client.listMessages(conv.id, 80);
    const decisao = decidirParada(mensagens, /* @__PURE__ */ new Date());
    const resposta = { ...decisao, conversa: conv.id, atendentes_da_conversa: donos.filter(Boolean), proximo: null };
    if (decisao.reatribuir) {
      const lead = await client.getLead(leadId).catch(() => null);
      const excluirNomes = [...donos, decisao.ultimo_humano, lead?.attendant?.name].filter(Boolean);
      const escolha = await escolherVendedor(env, leadId, {
        excluirNomes,
        motivo: "reatribuicao por inatividade (" + decisao.minutos_sem_resposta + " min)",
        registrar: url.searchParams.get("registrar") === "1"
      });
      resposta.proximo = escolha ? { nome: escolha.nome, userId: escolha.userId } : null;
    }
    return jsonResp(resposta);
  } catch (e) {
    return jsonResp({ reatribuir: false, motivo: "erro_ao_verificar", erro: String(e).slice(0, 200) });
  }
}
__name(conversaParada, "conversaParada");
__name2(conversaParada, "conversaParada");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname === "/saude") {
      if (env.SAUDE_TOKEN) {
        const auth = request.headers.get("Authorization") ?? "";
        if (auth !== `Bearer ${env.SAUDE_TOKEN}`) {
          return new Response("Unauthorized", { status: 401 });
        }
      }
      const saude = await checarSaudeRoteamento(env);
      return new Response(JSON.stringify(saude), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/conversa-parada") {
      return conversaParada(request, env, url);
    }
    if (url.pathname !== "/rotear") return new Response("Not found", { status: 404 });
    if (env.ROUTER_BEARER_TOKEN) {
      const auth = request.headers.get("Authorization") ?? "";
      if (auth !== `Bearer ${env.ROUTER_BEARER_TOKEN}`) {
        return new Response("Unauthorized", { status: 401 });
      }
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }
    if (!body.leadId) return new Response(JSON.stringify({ error: "leadId \xE9 obrigat\xF3rio" }), { status: 400 });
    const client = body.atribuir ? new DataCrazyClient(env.DATACRAZY_API_TOKEN) : null;
    if (client) {
      let dono = null;
      try {
        const lead = await client.getLead(body.leadId);
        dono = lead?.attendant ?? null;
      } catch (e) {
        return new Response(JSON.stringify({
          skip: true,
          motivo: "nao foi possivel verificar o atendente atual",
          erro: String(e)
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (dono?.userId) {
        return new Response(JSON.stringify({
          skip: true,
          motivo: "lead ja possui atendente",
          atendenteAtual: dono.name ?? dono.userId
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }
    const escolha = await escolherVendedor(env, body.leadId);
    if (!escolha) {
      return new Response(JSON.stringify({ error: "nenhum vendedor eleg\xEDvel no momento" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (client) {
      await client.updateLeadAttendant(body.leadId, escolha.userId);
    }
    return new Response(JSON.stringify(escolha), { headers: { "Content-Type": "application/json" } });
  },
  async scheduled(event, env) {
    const domingo = new Date(event.scheduledTime).getUTCDay() === 0;
    if (domingo) {
      await syncTemposResposta(env);
    } else {
      await syncNegociosERecalcular(env);
    }
    await gravarSnapshotSaude(env);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
