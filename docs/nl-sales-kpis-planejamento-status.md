# Status do planejamento — NL Sales KPIs

Produto: aba de KPIs de obsessão do agente NL Sales (+ passagem para vendedor) no dashboard do CRM (`cloudflare/crm-dashboard`, Worker `nl-sales-crm-dashboard`, D1 `nl-sales-desempenho-vendedores`). Identidade visual: Nobre Lar (preto #0D0D0D, amarelo #F6DB2C, cinza #F4F4F2, verde #1E7A34, vermelho #B3261E, logo `faturamento/public/logo.png`).

## Rota (confirmada em 09/10/2026)
1 Brainstorm ✅ · 2A Benchmark ✅ (confirmado 09/10) · 3 Spec ✅ (aguarda aprovação) · 2B pulada (cliente = Nobre Lar) · 3 Spec · 4 pulada (stack existente: Cloudflare Workers + D1 + Data Crazy) · 5 Design · 6 Plano · 7 Auditoria · 8 Correção · 9 Montagem

## Decisões da Fase 1 (aprovadas: "opção A")
- Ponteiro: vendas fechadas e conversão lead → venda, atribuídas ao atendimento.
- Escopo: agente + passagem para o vendedor.
- Onde: nova aba no dashboard existente.
- KPI-norte: negócios ganhos por 100 leads novos (coorte 30 dias).
- Obsessão (4): taxa de resolução (30d), orçamento → fechamento, retorno do follow-up, passagem agente → vendedor atendida em ≤ 30 min.
- Apoio: tempo de 1ª resposta, leads parados > 7 dias, motivos de perda, ticket médio (Hiper), recompra.
- Primeiro passo técnico: limpar o funil (84% dos negócios sem resolução).

## Achados que condicionam a spec
- Só 435 de 2.781 negócios resolvidos; valor em R$ quase sempre 0 (faturamento vem do Hiper por nome de cliente).
- `leads_metadata` tem só 76 leads: criação de lead precisa de nova fonte/sync.
- Não separa o que o agente atendeu sozinho: requisito novo.
- Velocidade de resposta não separa ganho de perda nos nossos dados.

## Artefatos
- Benchmark: `docs/nl-sales-kpis-benchmark.md` (cópia em `~/pesquisas/pesquisa-kpis-agente-vendas-whatsapp-2026-10-09.md`)

- Spec: `docs/nl-sales-kpis-spec.md` (R1-R10) · Constituição: `docs/nl-sales-kpis-constituicao.md`

## Correção registrada
Diagnóstico inicial de '84% sem resolução' era grosseiro: funil ativo aberto ≈ 519; Frio (1.178) é base estacionada; 525 'Clientes Perdidos' abertos são inconsistência.

## 15/10/2026
- Spec aprovada. R4 revisado (tag em vez de mensagem no grupo) e R11 novo (erros do agente ao cliente).
- Fase 5: layout escolhido = A + C. Mockup com 3 variações e 3 estados em `docs/design-nl-sales-kpis/nl-sales-kpis.html` (screenshots v1/v2/v3 .png). Variação 1 escolhida. Menu lateral ganhou "Performance por vendedor" (R12). Design doc escrito: `docs/nl-sales-kpis-design.md` (aguarda aprovação).

## Fase 6 — Plano escrito (15/10/2026)
- Plano A: `docs/superpowers/plans/2026-10-15-nl-sales-kpis.md` (Tasks 0 a 9): R1 aproximado, R2, R6, R7, R8, R9 (lista), R10 e R12 (menos R12.9).
- Plano B (a escrever): R3, R4, R5, R11 e R12.9, que exigem coletar mensagens, entradas na lista de follow-up e leads sem vendedor.
- Regra de distribuição em produção confirmada pelo log: cota diária desde 15/09; código publicado a trazer para o repositório (Task 0).

## Fase 7 — Auditoria concluída (15/10/2026)
- Relatório: `docs/nl-sales-kpis-audit.md` (5 P0, 16 P1; nenhum refutado).
- Decisões pendentes da Keoma: origem do `lead_id` = agente (P0-1) e B2B no funil (P0-4).

## Fase 8 — Correção concluída (15/10/2026)
- Plano v2: `docs/superpowers/plans/2026-10-15-nl-sales-kpis.md` (a v1 auditada ficou em `...v1-auditado.md`). Módulos executados antes de entrar no plano: 66 testes e `tsc --noEmit` sem erro.
- Decisões da Keoma: B2B separado; KPI-norte indisponível até o `lead_id` real voltar ao log.
- Spec ajustada: R1.1, R1.6 (novo), R2.1 e R12.10.

## Fase 9 — Montagem concluída (15/10/2026)
- `docs/nl-sales-kpis-features.json` (50 critérios: 33 no Plano A, 16 no Plano B, 1 parcial)
- `docs/nl-sales-kpis-jornadas.md` (7 jornadas, protocolo em 3 resoluções)
- `CLAUDE.md` na raiz do projeto (governança).

## Execução do Plano A (15/10/2026)
- Tasks 1 a 10 feitas na branch `feat/nl-sales-kpis` (68 testes, typecheck limpo).
- Migração aplicada no D1 (tabelas `negocios_snapshot` e `kpi_metas`, índices `idx_negocios_lead`, `idx_log_roteamento_em`, `idx_snapshot_negocio`).
- Publicado: `https://nl-sales-crm-dashboard.nobrelar.workers.dev` (versão cdfc194b), cron do snapshot às 10h UTC.
- Jornadas rodadas (2 rodadas); 2 defeitos achados e corrigidos (API de candidatos cortava em 500 sem avisar; alvo de toque da dica "?"). Versão em produção: 871a1d3c.
- Pendente: Task 0 (código publicado do roteador e cota por vendedor), J4.3/J4.4 (primeiro cron do snapshot) e Plano B (R3, R4, R5, R11).

## Tarefa 0 — executada pela CLI (15/10/2026)
- Código publicado do roteador baixado com `wrangler init --from-dash` (versão 600eba8c, deploy de 2026-10-02): copiado para `cloudflare/vendedores-router/src/index.publicado-2026-10-02.js` (sem segredos; a TS local continua defasada).
- **Regra real:** distribuição proporcional a `score_final ** 2` entre `DESTINOS_PERMITIDOS` (Wesley, Mikhaell, Geicy, Leonardo, Francisco). Camila e Kayllane não estão na lista e não recebem lead. Não existe "cota por vendedor" fixa.
- **`lead_id = 'agente'`:** o código publicado NÃO grava esse valor nem o motivo "cota diária (transferência do agente)"; o `/rotear` grava o `leadId` que recebe. Há outro escritor em `log_roteamento` (Worker ou chamada direta ao D1) que a CLI não lista. Para identificar, é preciso a lista de Workers da conta no painel da Cloudflare (a aba do navegador do Claude não está logada).
