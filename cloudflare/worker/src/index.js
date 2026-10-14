// API do Painel de Cobrança da Nobre Lar. Rotas (todas exigem header X-Api-Key):
//   GET  /api/dashboard-data  -> titulos + clientes (join) + tratativas
//   GET  /api/tratativas      -> historico, filtro opcional ?cliente=
//   POST /api/tratativas      -> registra uma tratativa nova (aceita data_promessa/valor_recebido opcionais)
//   POST /api/tratativas/reconciliar -> marca um Recebimento parcial como já refletido no Hiper
//   POST /api/tratativas/editar -> corrige uma tratativa existente (texto/status/promessa/valor)
//   GET  /api/receitas        -> vendas item-a-documento, filtros ?de=&ate=&cliente=
//   GET  /api/sangrias        -> lancamentos de caixa (sangria/suprimento), filtros ?de=&ate=&loja=&operador=
//   POST /api/sync-titulos    -> upsert em lote de titulos (contas a receber) + marca quitados
//   POST /api/sync-sangrias   -> upsert em lote de sangrias/suprimentos (INSERT OR IGNORE)
//   POST /api/sync/titulos    -> upsert em lote de titulos, shape alternativo {documentos, idsAbertos}
//   POST /api/sync/receitas   -> upsert em lote de receitas
//   POST /api/sync/vendas-produto-mes -> upsert em lote de vendas por produto/mes
//   GET  /api/vendas-produto-mes -> acumulado do mes por produto, ?ano=AAAA&meses=M[,M]
// As rotas de sync existem pra permitir que outra pessoa (ex: a cobradora, com o Chrome dela
// logado no Hiper) rode a sincronização sem precisar do CLOUDFLARE_API_TOKEN de admin — só da
// X-Api-Key deste Worker, que só abre essas rotas específicas, nunca acesso direto ao D1.
// Tudo fora de /api/* é servido como arquivo estatico de public/ (ver wrangler.toml).
// Documentacao completa: ../README.md
//
// ⚠️ 2026-08-29 e 2026-09-08: DUAS VEZES alguém fez deploy direto (sem passar pelo Git) usando
// uma cópia desatualizada do código, e isso apagou sem querer as rotas de sangrias e o
// endpoint /api/sangrias. Se você está lendo isso porque vai editar este arquivo: SEMPRE dê
// `git pull origin main` no repositório `central-nobre-lar` antes de editar, e NUNCA rode
// `wrangler deploy` sem ter dado pull primeiro. Ver docs/guia-git-e-deploy-equipe.md nesse
// repositório pro fluxo completo. Isso já causou dois incidentes de dado real corrompido.

function cors(resp) {
  resp.headers.set("Access-Control-Allow-Origin", "*");
  resp.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  resp.headers.set("Access-Control-Allow-Headers", "Content-Type,X-Api-Key");
  return resp;
}

function json(data, status = 200) {
  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function checkAuth(request, env) {
  const key = request.headers.get("X-Api-Key");
  return key && key === env.API_KEY;
}

async function handleDashboardData(env) {
  const titulos = await env.DB.prepare(
    `WITH ultima_venda AS (
       SELECT cliente, vendedores,
              ROW_NUMBER() OVER (PARTITION BY trim(cliente) COLLATE NOCASE ORDER BY data DESC) rn
       FROM receitas
     )
     SELECT t.id_documento, t.loja, t.cliente, t.numero, t.descricao,
            t.data_vencimento, t.valor_total, t.valor_quitado, t.saldo,
            t.valor_original,
            t.situacao, t.aberta, t.quitada, t.vencida, t.estornada,
            c.telefone,
            COALESCE(uv.vendedores, c.vendedor) AS vendedor
     FROM titulos t
     LEFT JOIN clientes c ON trim(c.nome) = trim(t.cliente) COLLATE NOCASE
     LEFT JOIN ultima_venda uv ON trim(uv.cliente) = trim(t.cliente) COLLATE NOCASE AND uv.rn = 1`
  ).all();

  const tratativas = await env.DB.prepare(
    `SELECT id, cliente, data, status, tratativa, autor, created_at, data_promessa, valor_recebido, reconciliado
     FROM tratativas ORDER BY created_at DESC`
  ).all();

  const ultimoSync = await env.DB.prepare(
    `SELECT MAX(synced_at) AS titulos, (SELECT MAX(synced_at) FROM clientes) AS clientes
     FROM titulos`
  ).first();

  return json({
    titulos_raw: titulos.results,
    tratativas: tratativas.results,
    generated_at: new Date().toISOString(),
    hiper_sync_titulos: ultimoSync && ultimoSync.titulos,
    hiper_sync_clientes: ultimoSync && ultimoSync.clientes,
  });
}

async function handleGetTratativas(env, url) {
  const cliente = url.searchParams.get("cliente");
  if (cliente) {
    const r = await env.DB.prepare(
      `SELECT id, cliente, data, status, tratativa, autor, created_at, data_promessa, valor_recebido, reconciliado
       FROM tratativas WHERE cliente = ? COLLATE NOCASE ORDER BY created_at DESC`
    )
      .bind(cliente)
      .all();
    return json({ tratativas: r.results });
  }
  const r = await env.DB.prepare(
    `SELECT id, cliente, data, status, tratativa, autor, created_at, data_promessa, valor_recebido, reconciliado
     FROM tratativas ORDER BY created_at DESC LIMIT 500`
  ).all();
  return json({ tratativas: r.results });
}

async function handleReceitas(env, url) {
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");
  const cliente = url.searchParams.get("cliente");
  const conditions = [];
  const params = [];
  if (de) {
    conditions.push("data >= ?");
    params.push(de);
  }
  if (ate) {
    conditions.push("data <= ?");
    params.push(ate);
  }
  if (cliente) {
    conditions.push("cliente = ? COLLATE NOCASE");
    params.push(cliente);
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const r = await env.DB.prepare(
    `SELECT loja, data, meio_pagamento, tipo_documento, venda, cliente, vendedores,
            numero_documento, valor, valor_total, valor_produtos, valor_servicos,
            desconto, acrescimo, valor_frete_seguro_despesas, valor_tributos,
            total_itens, mes, ano
     FROM receitas ${where} ORDER BY data DESC LIMIT 5000`
  )
    .bind(...params)
    .all();
  return json({ receitas: r.results, count: r.results.length });
}

// O campo "loja" que vem do relatório do Hiper é o nome da razão social (sempre "NOBRE LAR
// VAREJO..."), não distingue as duas lojas físicas. A loja de verdade é inferida pelo operador
// do caixa (confirmado pela Keoma em 2026-08-17): CAIXAMARIA e EDVALDO operam o caixa da Home
// Center, KAYLLANE opera o caixa da Centro. Se aparecer um operador novo não mapeado aqui, cai
// no valor bruto do Hiper (fallback) — sinal de que a lista precisa ser atualizada.
const LOJA_POR_OPERADOR = {
  CAIXAMARIA: "Home Center",
  EDVALDO: "Home Center",
  KAYLLANE: "Centro",
  ADMINISTRATIVO: "Home Center", // faturamento feito pelo administrativo (confirmado pela Keoma 2026-08-17)
};

function lojaReal(usuarioCaixa, lojaFallback) {
  const key = (usuarioCaixa || "").toUpperCase().trim();
  return LOJA_POR_OPERADOR[key] || lojaFallback || "Não identificada";
}

// Regras de categorização de sangrias, nesta ordem (a primeira que bater vence):
//   1. "COFRE" no motivo -> dinheiro entregue a uma pessoa (cofre/depósito) -> categoria "cofre",
//      nome da pessoa extraído do que vem depois de "COFRE"/"/".
//   2. "BAIXA" ou "CREDIARIO" no motivo (confirmado pela Keoma em 2026-08-17):
//        - se também citar "JVM" -> é pagamento ao JVM (CEO) -> categoria "cofre", pessoa "JVM".
//        - senão -> baixa de crediário paga em dinheiro (por isso precisou de sangria) ->
//          categoria "baixa_credito". NÃO é despesa nem cofre: é dinheiro de venda a prazo saindo
//          do caixa físico, não gasto nem repasse a alguém — fica numa aba própria.
//   3. Palavras-chave de despesa conhecida -> categoria "despesa" com subcategoria sugerida,
//      pronta pra a funcionária lançar no sistema financeiro.
//   4. Nada bateu -> categoria "revisar" (não adivinha: fica sinalizado pra conferência manual).
// Suprimentos (abertura de caixa etc.) não passam por isso: são só movimento interno de caixa,
// não entram no controle de sangrias.
const REGRAS_DESPESA = [
  [/OLEO|COMBUSTIVEL|ARLA|LAVAGEM|CAMINHAO|\bMOTO\b|PNEU|MECANIC|GAS.*EMPILHADEIRA|EMPILHADEIRA.*GAS/, "Veículos/Combustível"],
  [/GAS.*COZINHA|COZINHA.*GAS/, "Alimentação/Consumo"],
  [/LONAMENTO|FRETE|TRANSPORTE|CARRETO/, "Frete/Transporte"],
  [/RECISAO|RESCISAO|DIARIA|SALARIO|\bFOLHA\b|FERIAS|\bVALE\b/, "Pessoal/RH"],
  [/FAXINA|LIMPEZA|JARDINAGEM/, "Limpeza/Serviços"],
  [/CARTUCHO|IMPRESSORA|PAPEL\b|MATERIAL DE ESCRITORIO/, "Material de escritório"],
  [/VIAGEM|PASSAGEM|HOSPEDAGEM|\bHOTEL\b|\bUBER\b/, "Viagem/Deslocamento"],
  [/\bAGUA\b|LANCHE|\bCAFE\b|ALMOCO|REFEICAO|SALGADOS|\bREFRI\b/, "Alimentação/Consumo"],
  [/RADIO|ANUNCIO|PROPAGANDA|PANFLETO|OUTDOOR/, "Marketing/Publicidade"],
  [/DINAMICA|TREINAMENTO|PALESTRA|CONFRATERNIZACAO/, "Eventos/Treinamento"],
  [/RACAO|\bSAL\b/, "Insumos diversos"],
];

// Remove acentos antes de casar as regras (o Hiper não é consistente: "ALMOÇO" e "ALMOCO"
// aparecem os dois; sem isso, metade dos motivos com acento caía em "revisar" à toa).
function normalizarMotivo(s) {
  return (s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function classificarSangria(operacao, motivoRaw) {
  const motivo = normalizarMotivo(motivoRaw);
  if (operacao !== "Sangria") {
    return { categoria: "suprimento", pessoa: null, despesa_categoria: null };
  }
  const mCofre = motivo.match(/COFRE\s*\/?\s*(.*)/);
  if (mCofre) {
    let pessoa = (mCofre[1] || "").replace(/[^A-Za-zÀ-ÿ0-9\s]/g, "").trim();
    pessoa = pessoa ? pessoa.replace(/\s+/g, " ") : "Não identificado";
    return { categoria: "cofre", pessoa, despesa_categoria: null };
  }
  if (/BAIXA|CREDIARIO|\bCRED\b/.test(motivo)) {
    if (/JVM/.test(motivo)) {
      return { categoria: "cofre", pessoa: "JVM", despesa_categoria: null };
    }
    return { categoria: "baixa_credito", pessoa: null, despesa_categoria: null };
  }
  for (const [re, categoria] of REGRAS_DESPESA) {
    if (re.test(motivo)) {
      return { categoria: "despesa", pessoa: null, despesa_categoria: categoria };
    }
  }
  return { categoria: "revisar", pessoa: null, despesa_categoria: "Revisar" };
}

async function handleSangrias(env, url) {
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");
  const loja = url.searchParams.get("loja");
  const operador = url.searchParams.get("operador");
  const conditions = [];
  const params = [];
  if (de) {
    conditions.push("data >= ?");
    params.push(de);
  }
  if (ate) {
    conditions.push("data <= ?");
    params.push(ate);
  }
  if (operador) {
    conditions.push("usuario_caixa = ? COLLATE NOCASE");
    params.push(operador);
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const r = await env.DB.prepare(
    `SELECT id, data, operacao, valor, usuario_caixa, loja, motivo, synced_at
     FROM sangrias ${where} ORDER BY data DESC, id DESC LIMIT 2000`
  )
    .bind(...params)
    .all();
  let linhas = r.results.map((row) =>
    Object.assign({}, row, { loja: lojaReal(row.usuario_caixa, row.loja) }, classificarSangria(row.operacao, row.motivo))
  );
  if (loja) {
    linhas = linhas.filter((l) => l.loja.toLowerCase() === loja.toLowerCase());
  }
  const ultimoSync = await env.DB.prepare(`SELECT MAX(synced_at) AS s FROM sangrias`).first();
  return json({ sangrias: linhas, count: linhas.length, hiper_sync_sangrias: ultimoSync && ultimoSync.s });
}

async function handlePostTratativa(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const { cliente, status, tratativa, autor, data_promessa, valor_recebido } = body;
  if (!cliente || !tratativa) {
    return json({ error: "campos obrigatórios: cliente, tratativa" }, 400);
  }
  const data = new Date().toISOString().slice(0, 10);
  const result = await env.DB.prepare(
    `INSERT INTO tratativas (cliente, data, status, tratativa, autor, data_promessa, valor_recebido) VALUES (?,?,?,?,?,?,?)`
  )
    .bind(cliente, data, status || null, tratativa, autor || null, data_promessa || null, valor_recebido != null ? Number(valor_recebido) : null)
    .run();
  return json({ ok: true, id: result.meta.last_row_id });
}

// Edita uma tratativa já registrada (corrigir texto, status, promessa ou valor recebido).
// Recuperado do bundle em produção em 2026-09-23: esta rota estava no ar mas não existia em
// nenhuma cópia do código em disco — ver o aviso de deploy no topo do arquivo.
async function handleEditarTratativa(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const id = Number(body.id);
  const { status, tratativa, data_promessa, valor_recebido } = body;
  if (!Number.isInteger(id) || !tratativa) {
    return json({ error: "campos obrigatórios: id (inteiro), tratativa" }, 400);
  }
  const result = await env.DB.prepare(
    `UPDATE tratativas SET status = ?, tratativa = ?, data_promessa = ?, valor_recebido = ? WHERE id = ?`
  )
    .bind(
      status || null,
      tratativa,
      data_promessa || null,
      valor_recebido != null ? Number(valor_recebido) : null,
      id
    )
    .run();
  if (!result.meta.changes) {
    return json({ error: "tratativa não encontrada" }, 404);
  }
  return json({ ok: true });
}

// Marca uma tratativa de "Recebimento parcial" como já refletida no Hiper — a partir daí ela
// para de somar em "Total recuperado" (o título quitado/reduzido pelo sync já conta sozinho),
// evitando contar o mesmo recebimento duas vezes.
async function handleReconciliarTratativa(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return json({ error: "campo obrigatório: id (inteiro)" }, 400);
  }
  const result = await env.DB.prepare(
    `UPDATE tratativas SET reconciliado = 1 WHERE id = ? AND status = 'Recebimento parcial'`
  )
    .bind(id)
    .run();
  if (!result.meta.changes) {
    return json({ error: "tratativa não encontrada ou não é um Recebimento parcial" }, 404);
  }
  return json({ ok: true });
}

// Upsert em lote de titulos (contas a receber). Body: { rows: [{id_documento, id_externo,
// loja, cliente, numero, descricao, data_vencimento, valor_total, valor_quitado, saldo,
// valor_original, situacao, aberta, quitada, vencida, estornada}, ...] }.
// Nunca DELETE — upsert por id_documento, depois marca como quitado (aberta=0, quitada=1)
// quem estava aberto no D1 mas não veio nesta leva (procedimento documentado em schema.sql).
// Roda em `env.DB.batch(...)` em blocos de 100 statements.
async function handleSyncTitulosLote(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows || rows.length === 0) {
    return json({ error: "campo obrigatório: rows (array não vazio)" }, 400);
  }

  const ids = [];
  const stmts = [];
  for (const x of rows) {
    const id = Number(x.id_documento);
    if (!Number.isInteger(id)) continue; // linha malformada: pula, não derruba o lote inteiro
    ids.push(id);
    stmts.push(
      env.DB.prepare(
        `INSERT OR REPLACE INTO titulos
          (id_documento, id_externo, loja, cliente, numero, descricao, data_vencimento,
           valor_total, valor_quitado, saldo, valor_original, situacao, aberta, quitada,
           vencida, estornada, synced_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))`
      ).bind(
        id,
        x.id_externo ?? null,
        x.loja ?? null,
        String(x.cliente ?? "").trim(),
        x.numero ?? null,
        x.descricao ?? null,
        x.data_vencimento,
        Number(x.valor_total) || 0,
        Number(x.valor_quitado) || 0,
        Number(x.saldo) || 0,
        x.valor_original != null ? Number(x.valor_original) : Number(x.valor_total) || 0,
        x.situacao ?? null,
        x.aberta ? 1 : 0,
        x.quitada ? 1 : 0,
        x.vencida ? 1 : 0,
        x.estornada ? 1 : 0
      )
    );
  }
  if (ids.length === 0) {
    return json({ error: "nenhuma linha válida em rows (precisa de id_documento inteiro)" }, 400);
  }

  const BATCH = 100;
  for (let i = 0; i < stmts.length; i += BATCH) {
    await env.DB.batch(stmts.slice(i, i + BATCH));
  }

  // Marca como quitado quem estava aberto e não veio nesta leva. IDs já validados como
  // inteiros acima, então interpolar direto no NOT IN é seguro (sem injeção possível).
  const before = await env.DB.prepare(
    `SELECT COUNT(*) as c, COALESCE(SUM(saldo),0) as s FROM titulos
     WHERE aberta = 1 AND id_documento NOT IN (${ids.join(",")})`
  ).first();
  await env.DB.prepare(
    `UPDATE titulos SET aberta = 0, quitada = 1, vencida = 0, saldo = 0,
       situacao = 'Quitada (detectado por sync)'
     WHERE aberta = 1 AND id_documento NOT IN (${ids.join(",")})`
  ).run();

  const totalAberto = await env.DB.prepare(
    `SELECT COUNT(*) as total, COALESCE(SUM(saldo),0) as saldo FROM titulos WHERE aberta = 1`
  ).first();

  return json({
    ok: true,
    rows_sincronizadas: ids.length,
    quitados_detectados: before.c,
    valor_recuperado: before.s,
    total_aberto: totalAberto.total,
    saldo_total_aberto: totalAberto.saldo,
  });
}

// Upsert em lote de sangrias/suprimentos. Body: { rows: [[data, operacao, valor,
// usuario_caixa, loja, motivo], ...] } — mesmo array-de-arrays compacto que o fluxo manual já
// usa (ver skill nobrelar-hiper). INSERT OR IGNORE: a UNIQUE(data, loja, usuario_caixa, valor,
// motivo) evita duplicar se a mesma leva for reenviada.
async function handleSyncSangrias(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows || rows.length === 0) {
    return json({ error: "campo obrigatório: rows (array não vazio)" }, 400);
  }

  const stmts = rows
    .filter((r) => Array.isArray(r) && r.length === 6 && r[0])
    .map((r) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO sangrias (data, operacao, valor, usuario_caixa, loja, motivo)
         VALUES (?,?,?,?,?,?)`
      ).bind(r[0], r[1], Number(r[2]) || 0, r[3] ?? null, r[4] ?? null, r[5] ?? null)
    );
  if (stmts.length === 0) {
    return json({ error: "nenhuma linha válida em rows (esperado array de 6 posições)" }, 400);
  }

  const BATCH = 100;
  for (let i = 0; i < stmts.length; i += BATCH) {
    await env.DB.batch(stmts.slice(i, i + BATCH));
  }

  const summary = await env.DB.prepare(
    `SELECT COUNT(*) as total, MIN(data) as min_data, MAX(data) as max_data FROM sangrias`
  ).first();

  return json({
    ok: true,
    rows_enviadas: stmts.length,
    total_no_banco: summary.total,
    min_data: summary.min_data,
    max_data: summary.max_data,
  });
}

// --- Rotas alternativas de sync, shape diferente: body { documentos: [{idDocumento,
// idExterno, loja, cliente, numero, descricao, dataVencimento, valorTotal, valorQuitado,
// saldo, situacao, aberta, quitada, vencida, estornada}, ...], idsAbertos: [id, ...] }. Usa
// ON CONFLICT DO UPDATE (nunca INSERT OR REPLACE — evita apagar+reinserir a linha) e fecha
// por UPDATE ... WHERE id_documento IN (...) dos ids que sumiram da lista de abertos.
const LOTE_UPSERT_TITULOS = 100;
async function upsertTitulosDocumentos(db, documentos) {
  let gravados = 0;
  for (let i = 0; i < documentos.length; i += LOTE_UPSERT_TITULOS) {
    const pedaco = documentos.slice(i, i + LOTE_UPSERT_TITULOS);
    const statements = pedaco.map((d) =>
      db
        .prepare(
          `INSERT INTO titulos
             (id_documento, id_externo, loja, cliente, numero, descricao, data_vencimento,
              valor_total, valor_quitado, saldo, situacao, aberta, quitada, vencida, estornada, synced_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
           ON CONFLICT(id_documento) DO UPDATE SET
             id_externo = excluded.id_externo,
             loja = excluded.loja,
             cliente = excluded.cliente,
             numero = excluded.numero,
             descricao = excluded.descricao,
             data_vencimento = excluded.data_vencimento,
             valor_total = excluded.valor_total,
             valor_quitado = excluded.valor_quitado,
             saldo = excluded.saldo,
             situacao = excluded.situacao,
             aberta = excluded.aberta,
             quitada = excluded.quitada,
             vencida = excluded.vencida,
             estornada = excluded.estornada,
             synced_at = datetime('now')`
        )
        .bind(
          d.idDocumento,
          d.idExterno ?? null,
          d.loja ?? null,
          d.cliente ?? "",
          d.numero ?? null,
          d.descricao ?? null,
          d.dataVencimento,
          d.valorTotal,
          d.valorQuitado ?? 0,
          d.saldo,
          d.situacao ?? null,
          d.aberta ? 1 : 0,
          d.quitada ? 1 : 0,
          d.vencida ? 1 : 0,
          d.estornada ? 1 : 0
        )
    );
    await db.batch(statements);
    gravados += pedaco.length;
  }
  return gravados;
}

const LOTE_IDS_TITULOS = 100;
async function fecharTitulosQueSairamDaLista(db, idsAbertos) {
  const idsNovos = new Set(idsAbertos.filter((id) => Number.isInteger(id)));
  if (idsNovos.size === 0) return 0;
  const { results } = await db.prepare(`SELECT id_documento FROM titulos WHERE aberta = 1`).all();
  const idsParaFechar = (results || []).map((r) => r.id_documento).filter((id) => !idsNovos.has(id));
  let totalFechados = 0;
  for (let i = 0; i < idsParaFechar.length; i += LOTE_IDS_TITULOS) {
    const pedaco = idsParaFechar.slice(i, i + LOTE_IDS_TITULOS);
    const placeholders = pedaco.map(() => "?").join(",");
    const r = await db
      .prepare(
        `UPDATE titulos
         SET aberta = 0, quitada = 1, saldo = 0, situacao = 'Quitada (detectado por sync)'
         WHERE aberta = 1 AND id_documento IN (${placeholders})`
      )
      .bind(...pedaco)
      .run();
    totalFechados += (r.meta && r.meta.changes) || 0;
  }
  return totalFechados;
}

async function handleSyncTitulosDocumentos(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const documentos = Array.isArray(body.documentos) ? body.documentos : [];
  const idsAbertos = Array.isArray(body.idsAbertos) ? body.idsAbertos : [];
  const gravados = await upsertTitulosDocumentos(env.DB, documentos);
  const fechados = await fecharTitulosQueSairamDaLista(env.DB, idsAbertos);
  return json({ ok: true, gravados, fechados });
}

async function handleSyncReceitasLinhas(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const linhas = Array.isArray(body.linhas) ? body.linhas : [];
  if (!linhas.length) return json({ ok: true, gravados: 0 });
  const LOTE = 100;
  let gravados = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const pedaco = linhas.slice(i, i + LOTE);
    const statements = pedaco.map((l) =>
      env.DB.prepare(
        `INSERT INTO receitas
           (loja, data, meio_pagamento, tipo_documento, venda, cliente, vendedores,
            numero_documento, valor, valor_total, valor_produtos, valor_servicos,
            desconto, acrescimo, valor_frete_seguro_despesas, valor_tributos,
            total_itens, mes, ano)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7], l[8], l[9],
        l[10], l[11], l[12], l[13], l[14], l[15], l[16], l[17], l[18]
      )
    );
    await env.DB.batch(statements);
    gravados += pedaco.length;
  }
  return json({ ok: true, gravados });
}

// Upsert em lote de vendas por produto/mes. Body: { ano, mes, linhas: [[codigo, produto,
// categoria, loja, quantidade_vendida, valor_total_vendido, valor_unitario_medio,
// custo_medio], ...] }. UNIQUE(ano, mes, codigo) -> ON CONFLICT DO UPDATE.
async function handleSyncVendasProdutoMes(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const ano = Number(body.ano);
  const mes = Number(body.mes);
  const linhas = Array.isArray(body.linhas) ? body.linhas : [];
  if (!ano || !mes) return json({ error: "ano e mes são obrigatórios" }, 400);
  if (!linhas.length) return json({ ok: true, gravados: 0 });
  const LOTE = 100;
  let gravados = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const pedaco = linhas.slice(i, i + LOTE);
    const statements = pedaco.map((l) =>
      env.DB.prepare(
        `INSERT INTO vendas_produto_mes
           (ano, mes, codigo, produto, categoria, loja, quantidade_vendida,
            valor_total_vendido, valor_unitario_medio, custo_medio, synced_at)
         VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))
         ON CONFLICT(ano, mes, codigo) DO UPDATE SET
           produto = excluded.produto,
           categoria = excluded.categoria,
           loja = excluded.loja,
           quantidade_vendida = excluded.quantidade_vendida,
           valor_total_vendido = excluded.valor_total_vendido,
           valor_unitario_medio = excluded.valor_unitario_medio,
           custo_medio = excluded.custo_medio,
           synced_at = datetime('now')`
      ).bind(ano, mes, l[0], l[1], l[2] ?? null, l[3] ?? null, l[4] ?? 0, l[5] ?? 0, l[6] ?? null, l[7] ?? null)
    );
    await env.DB.batch(statements);
    gravados += pedaco.length;
  }
  return json({ ok: true, gravados });
}

// Leitura do acumulado do mes por produto. ?ano=AAAA&meses=M (ou M,M,M). Usada antes de
// somar o dia no sync: o upsert substitui o valor do mes daquele produto, entao quem
// grava precisa ler o que ja existe e somar.
async function handleVendasProdutoMes(env, url) {
  const ano = Number(url.searchParams.get("ano"));
  const meses = (url.searchParams.get("meses") || "")
    .split(",")
    .map((m) => Number(m.trim()))
    .filter(Boolean);
  if (!ano || !meses.length) return json({ error: "ano e meses são obrigatórios" }, 400);
  const placeholders = meses.map(() => "?").join(",");
  const r = await env.DB.prepare(
    `SELECT ano, mes, codigo, produto, categoria, loja, quantidade_vendida,
            valor_total_vendido, valor_unitario_medio, custo_medio
     FROM vendas_produto_mes
     WHERE ano = ? AND mes IN (${placeholders})`
  )
    .bind(ano, ...meses)
    .all();
  return json({ linhas: r.results, count: r.results.length });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    if (!checkAuth(request, env)) {
      return json({ error: "unauthorized" }, 401);
    }

    if (url.pathname === "/api/dashboard-data" && request.method === "GET") {
      return handleDashboardData(env);
    }

    if (url.pathname === "/api/tratativas" && request.method === "GET") {
      return handleGetTratativas(env, url);
    }

    if (url.pathname === "/api/tratativas" && request.method === "POST") {
      return handlePostTratativa(request, env);
    }

    if (url.pathname === "/api/tratativas/reconciliar" && request.method === "POST") {
      return handleReconciliarTratativa(request, env);
    }

    if (url.pathname === "/api/tratativas/editar" && request.method === "POST") {
      return handleEditarTratativa(request, env);
    }

    if (url.pathname === "/api/receitas" && request.method === "GET") {
      return handleReceitas(env, url);
    }

    if (url.pathname === "/api/sangrias" && request.method === "GET") {
      return handleSangrias(env, url);
    }

    if (url.pathname === "/api/sync-titulos" && request.method === "POST") {
      return handleSyncTitulosLote(request, env);
    }

    if (url.pathname === "/api/sync-sangrias" && request.method === "POST") {
      return handleSyncSangrias(request, env);
    }

    if (url.pathname === "/api/sync/titulos" && request.method === "POST") {
      return handleSyncTitulosDocumentos(request, env);
    }

    if (url.pathname === "/api/sync/receitas" && request.method === "POST") {
      return handleSyncReceitasLinhas(request, env);
    }

    if (url.pathname === "/api/sync/vendas-produto-mes" && request.method === "POST") {
      return handleSyncVendasProdutoMes(request, env);
    }

    if (url.pathname === "/api/vendas-produto-mes" && request.method === "GET") {
      return handleVendasProdutoMes(env, url);
    }

    return json({ error: "not found" }, 404);
  },
};
