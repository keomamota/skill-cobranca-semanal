-- migrations/0001_nl_sales_kpis.sql
-- Só cria objetos novos e índices; não altera linhas das tabelas existentes.
CREATE TABLE IF NOT EXISTS negocios_snapshot (
  dia TEXT NOT NULL,
  negocio_id TEXT NOT NULL,
  etapa TEXT,
  status TEXT NOT NULL,
  attendant_user_id TEXT,
  PRIMARY KEY (dia, negocio_id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_negocio ON negocios_snapshot (negocio_id, dia);

CREATE TABLE IF NOT EXISTS kpi_metas (
  chave TEXT PRIMARY KEY,
  na_meta REAL NOT NULL,
  atencao REAL NOT NULL,
  provisoria INTEGER NOT NULL DEFAULT 1,
  rotulo TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO kpi_metas (chave, na_meta, atencao, provisoria, rotulo) VALUES
  ('resolucao', 70, 55, 1, '≥ 70% em 30 dias'),
  ('orcamentoFechamento', 20, 15, 1, '20 a 40%'),
  ('retornoFollowup', 25, 18, 1, '25 a 40%'),
  ('passagem30min', 80, 60, 1, '≥ 80% em até 30 min');

CREATE INDEX IF NOT EXISTS idx_negocios_lead ON negocios (lead_id);
CREATE INDEX IF NOT EXISTS idx_log_roteamento_em ON log_roteamento (roteado_em);
