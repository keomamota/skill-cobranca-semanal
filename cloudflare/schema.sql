-- D1 database: nobrelar-contas-a-receber (uuid dae9b502-7088-4d37-a6bc-5160aa6192d5)
-- Applied directly via the Cloudflare MCP d1_database_query tool on 2026-08-12.
-- Kept here as the versioned source of truth for the schema.

CREATE TABLE titulos (
  id_documento INTEGER PRIMARY KEY,   -- Hiper IdDocumento
  id_externo TEXT,                    -- Hiper IdExterno (uuid)
  loja TEXT,                          -- ApelidoDaLoja
  cliente TEXT NOT NULL,              -- NomeDoCliente
  numero TEXT,                        -- Numero (ex: NFCE-11470-2-5/5)
  descricao TEXT,                     -- Descricao (ex: NFCE-11470)
  data_vencimento TEXT NOT NULL,      -- ISO date (DataDeVencimento)
  valor_total REAL NOT NULL,
  valor_quitado REAL NOT NULL DEFAULT 0,
  saldo REAL NOT NULL,                -- valor ainda em aberto
  situacao TEXT,                      -- SituacaoDescritivo (Aberta/Quitada/Vencida/Estornada)
  aberta INTEGER NOT NULL DEFAULT 0,
  quitada INTEGER NOT NULL DEFAULT 0,
  vencida INTEGER NOT NULL DEFAULT 0,
  estornada INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))  -- quando esta linha foi sincronizada do Hiper
);
CREATE INDEX idx_titulos_cliente ON titulos(cliente);
CREATE INDEX idx_titulos_vencimento ON titulos(data_vencimento);
CREATE INDEX idx_titulos_aberta ON titulos(aberta);

-- Procedimento de sincronização (a partir de 2026-08-14): o get-grid do Hiper só
-- retorna documentos ATUALMENTE abertos, então cada sync faz duas etapas, nunca um
-- DELETE + reinsert (isso apagaria o histórico de quem já foi cobrado com sucesso,
-- que a Keoma usa pra medir a eficiência do setor de cobrança):
--   1. INSERT OR REPLACE de todos os documentos que o Hiper devolveu como abertos
--      agora (upsert por id_documento — atualiza saldo/vencimento se mudou, insere
--      se for novo).
--   2. UPDATE ... SET aberta=0, quitada=1, saldo=0 WHERE aberta=1 AND id_documento
--      NOT IN (<ids do passo 1>) — qualquer título que estava aberto e não veio
--      mais na lista foi pago entre as sincronizações. Fica com
--      situacao='Quitada (detectado por sync)' pra distinguir de uma quitação que
--      o próprio Hiper já classificava como tal.
-- Assim a tabela cresce (nunca perde linha) e dá pra consultar, por exemplo,
-- "quantos títulos viraram quitados desde a última sincronização" como proxy de
-- quanto a cobrança conseguiu reaver.

CREATE TABLE tratativas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente TEXT NOT NULL,
  data TEXT NOT NULL,
  status TEXT,
  tratativa TEXT NOT NULL,
  autor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  data_promessa TEXT,    -- preenchido quando status = 'Promessa de pagamento'; usado pra
                          -- detectar promessa vencida (ver promessaVencida() no painel)
  valor_recebido REAL,   -- preenchido quando status = 'Recebimento parcial'; a cobradora
                          -- registra aqui um pagamento parcial que o cliente já fez mas que
                          -- ainda não apareceu no Hiper (ex: recebido em mãos, aguardando
                          -- lançamento). Entra na soma de "Total recuperado" do painel
                          -- imediatamente, sem esperar o próximo sync do Hiper, ENQUANTO
                          -- reconciliado = 0.
  reconciliado INTEGER NOT NULL DEFAULT 0  -- quando o Hiper enfim refletir esse recebimento
                          -- (após um sync), a cobradora marca esta tratativa como
                          -- reconciliada pelo painel (botão "já baixado no Hiper" no
                          -- histórico) e ela para de somar em "Total recuperado" — o valor
                          -- já é contado normalmente via titulos.quitada/saldo a partir daí.
                          -- Evita contar o mesmo recebimento duas vezes.
);
CREATE INDEX idx_tratativas_cliente ON tratativas(cliente);

-- Adicionada 2026-08-12: cadastro de clientes (telefone/CPF-CNPJ), extraído do
-- relatório "Clientes cadastrados" do Hiper (não vem do get-grid de contas a
-- receber). Usada para cruzar com `titulos.cliente` e achar o telefone pra
-- WhatsApp. codigo = Código do cliente no Hiper.
CREATE TABLE clientes (
  codigo INTEGER PRIMARY KEY,
  cpf_cnpj TEXT,
  nome TEXT NOT NULL,
  telefone TEXT,
  telefone_secundario TEXT,
  vendedor TEXT,
  endereco TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_clientes_nome ON clientes(nome);

-- Índices COLLATE NOCASE: o cruzamento titulos.cliente <-> clientes.nome é por
-- nome (não há um id de cliente em comum na resposta do get-grid), e precisa
-- ser case-insensitive. Sem esses índices, um JOIN com UPPER()/COLLATE NOCASE
-- faz table scan completo (medido: 14.5s / 41M rows lidas em ~19k clientes x
-- 2.2k títulos). Com o índice: ~5ms.
CREATE INDEX idx_titulos_cliente_upper ON titulos(cliente COLLATE NOCASE);
CREATE INDEX idx_clientes_nome_upper ON clientes(nome COLLATE NOCASE);

-- Adicionada 2026-08-13: vendas item-a-documento (relatório "Vendas realizadas -
-- Analítico", id 89, no Hiper). Histórico 2025-2026 importado de um CSV que a
-- Keoma já mantinha manualmente no Google Sheets (aba db_receitas) — o
-- relatório do Hiper em si é pesado demais pra extrair por período programático
-- (uma consulta de 1 mês só passou de 5 minutos sem terminar; ver
-- nobre-lar-cobranca-project memory). O vendedor por venda vem daqui
-- (`vendedores`), não da tabela `clientes` (que só tem "Vendedor preferido"
-- preenchido pra ~85 de 19 mil clientes) — o Worker pega o vendedor da venda
-- mais recente de cada cliente via COALESCE(receitas, clientes.vendedor).
-- Também é a base para futuras análises de faturamento.
CREATE TABLE receitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loja TEXT,
  data TEXT,                    -- ISO yyyy-mm-dd
  meio_pagamento TEXT,
  tipo_documento TEXT,
  venda TEXT,                   -- id da venda no Hiper
  cliente TEXT,
  vendedores TEXT,               -- pode ter mais de um nome por venda
  numero_documento TEXT,
  valor REAL,
  valor_total REAL,
  valor_produtos REAL,
  valor_servicos REAL,
  desconto REAL,
  acrescimo REAL,
  valor_frete_seguro_despesas REAL,
  valor_tributos REAL,
  total_itens INTEGER,
  mes INTEGER,
  ano INTEGER,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_receitas_cliente ON receitas(cliente COLLATE NOCASE);
CREATE INDEX idx_receitas_data ON receitas(data);
CREATE INDEX idx_receitas_venda ON receitas(venda);

-- Adicionada 2026-08-17: agregado diário por vendedor/loja (relatório "Vendas totais
-- por vendedor", id 59, no Hiper). Diferente de `receitas` (uma linha por venda), este
-- já vem pré-agregado pelo próprio Hiper por dia — não soma nada do lado de cá. Ver a
-- skill nobrelar-hiper (~/.claude/skills/nobrelar-hiper/SKILL.md) pra como sincronizar
-- (a chamada só funciona disparada pela própria SPA do Hiper via XHR-patch, fetch()
-- direto é bloqueado).
CREATE TABLE vendas_por_vendedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  loja TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  agrupamento TEXT,
  clientes_atendidos INTEGER,
  valor_vendas REAL,
  valor_devolucoes REAL,
  valor_vendas_liquidas REAL,
  ticket_medio REAL,
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(data, loja, vendedor)
);

-- Adicionada 2026-08-17: lançamentos de caixa (sangrias, suprimentos e retiradas de
-- suprimento) do relatório "Suprimentos, sangrias e retiradas de suprimentos" (id 50) no
-- Hiper. Sem id nativo do Hiper pro lançamento — a UNIQUE abaixo (data+loja+usuário+
-- valor+motivo) é o melhor proxy disponível pra evitar duplicar num re-sync; um caixa
-- lançando duas sangrias idênticas (mesmo valor E mesmo motivo) no mesmo dia é raro o
-- bastante pra aceitar o risco. Ver a skill nobrelar-hiper
-- (~/.claude/skills/nobrelar-hiper/SKILL.md) pra como sincronizar (mesma técnica
-- XHR-patch de vendas_por_vendedor — fetch() direto é bloqueado).
CREATE TABLE sangrias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  operacao TEXT NOT NULL,       -- Sangria / Suprimento / Retirada de suprimento
  valor REAL NOT NULL,
  usuario_caixa TEXT,
  loja TEXT,
  motivo TEXT,
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(data, loja, usuario_caixa, valor, motivo)
);
CREATE INDEX idx_sangrias_data ON sangrias(data);
CREATE INDEX idx_sangrias_loja ON sangrias(loja);
