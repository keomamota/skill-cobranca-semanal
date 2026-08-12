---
name: licitacoes-crateus-inhamuns
description: Radar diario de licitacoes (editais/pregoes) publicadas no PNCP para Crateus e a regiao dos Inhamuns (interior do Ceara), filtradas para compras de material de construcao — novo canal de vendas B2G da Nobre Lar. Use quando o usuario pedir editais, licitacoes, pregoes, compras publicas, ou "o que abriu no PNCP" para essa regiao, ou quando pedir o radar/relatorio diario de licitacoes.
---

# Radar de licitacoes - Crateus / Inhamuns (Nobre Lar)

Busca, no Portal Nacional de Contratacoes Publicas (PNCP), editais abertos nos municipios da
regiao de atuacao da Nobre Lar (Crateus + Inhamuns) cujo objeto sugere compra de material de
construcao, acabamento, ferragens, elétrica/hidraulica etc. Objetivo: abrir um canal de vendas
B2G (venda para orgaos publicos) como fornecedora, meta que se conecta a meta de faturamento de
R$2M/mes da empresa em dezembro.

Consulta a API publica do PNCP direto (`https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao`)
— a mesma fonte de dados que o MCP `@licinexusbr/mcp` (clonado em `licinexus-mcp/` na raiz do
projeto) encapsula. Rodar via script proprio (em vez de manter o servidor MCP vivo) porque isso e
um job em lote diario/semanal, nao uma conversa interativa — evita overhead de subir um processo
MCP so pra uma consulta agendada, e ja tem retry/backoff prontos para o rate limit do PNCP
(muito sensivel: mais de ~1 chamada por segundo por IP gera erro 429).

## Quando usar

- Usuario pede o "radar de licitacoes", "o que abriu essa semana", "editais novos", "licitacoes
  de material de construcao no interior do Ceara/regiao de Crateus/Inhamuns".
- Rotina diaria/semanal (ex: via `/schedule`) para alertar sobre editais novos.

## Como rodar

```bash
python3 .claude/skills/licitacoes-crateus-inhamuns/scripts/buscar_editais.py --dias 3
```

- `--dias N`: tamanho da janela retroativa (padrao 3 — rode com frequencia >= a essa janela pra
  nao perder nada nas bordas). Para o primeiro uso ou para auditoria manual, use uma janela maior
  (ex: `--dias 30`).
- `--todas`: ignora o filtro de palavras-chave (config/palavras_chave.json) e lista TODOS os
  editais das cidades cobertas nesse periodo — util pra revisar se o filtro de palavras esta
  deixando passar algo relevante.
- `--sem-dedupe`: nao aplica o dedupe de `data/vistos.json` (util pra reprocessar um periodo sem
  marcar nada como "novo" incorretamente, ou pra auditoria).

Saida: JSON no stdout com `editais` (lista ordenada por data de encerramento da proposta, mais
urgente primeiro), `totalEncontrados` e `falhas` (combinacoes cidade/modalidade que falharam apos
as tentativas de retry — raro, mas confira se a lista nao estiver vazia inesperadamente).

Depois de rodar, **apresente os resultados ao usuario em portugues, em formato de lista/tabela**
com: orgao, cidade, objeto (resumido), valor estimado, data de encerramento da proposta e o link
(`linkSistemaOrigem`). Destaque os que encerram mais perto (maior urgencia).

## Configuracao (editar conforme o negocio mudar)

- `config/municipios.json` — lista de municipios cobertos com codigo IBGE. Hoje: Crateus +
  Inhamuns (Taua, Independencia, Novo Oriente, Aiuaba, Parambu, Quiterianopolis, Catarina,
  Ararenda, Arneiroz, Antonina do Norte) + vizinhos proximos (Ipaporanga, Poranga, Nova Russas,
  Ipueiras). Adicione/remova cidades aqui se a area de entrega da Nobre Lar mudar.
- `config/palavras_chave.json` — termos buscados (substring, case-insensitive) no campo
  `objetoCompra` do edital. Ajuste conforme o mix de produtos vendidos.
- Modalidades de licitacao consultadas (fixas no script, `MODALIDADES` em
  `buscar_editais.py`): Pregao Eletronico (6), Pregao Presencial (7), Concorrencia Eletronica (4),
  Dispensa de Licitacao (8), Inexigibilidade (9) — as mais usadas para compras de material.
  Codigos completos do PNCP estao documentados no dicionario `MODALIDADE_NOMES` do script.

## Dedupe (nao repetir alerta do que ja foi visto)

`data/vistos.json` guarda os `numeroControlePNCP` ja retornados em execucoes anteriores. Cada
rodada so devolve editais **novos** desde a ultima execucao (a menos que use `--sem-dedupe`). Isso
e o que permite rodar diariamente e so mostrar o que mudou, sem o usuario ter que re-ler a mesma
lista todo dia.

## Limitacoes conhecidas do PNCP

- Rate limit agressivo por IP (HTTP 429) — o script ja espera e tenta de novo (backoff
  exponencial, ate 5 tentativas por chamada), mas isso torna a consulta lenta: com 15 municipios x
  5 modalidades, uma rodada completa leva alguns minutos. Nao paralelize as chamadas.
  Se rodar `--dias` grande (ex: 30+) em muitas cidades, espere a execucao levar varios minutos.
- O filtro de palavra-chave e por substring simples no texto do objeto — editais mal descritos
  (ex: "aquisicao diversa" sem detalhar) podem passar batido. Rode `--todas` periodicamente pra
  auditar manualmente o que o filtro esta deixando de fora.
- PNCP limita o intervalo de datas por consulta a 365 dias — irrelevante aqui pois usamos janelas
  curtas, mas relevante se algum dia quiser fazer uma busca historica ampla.

## Contexto de negocio

A Nobre Lar (home center no Ceara, diretora Keoma) esta buscando abrir um canal de vendas B2G
(fornecimento a orgaos publicos) como parte da meta de faturamento de R$2M no mes de dezembro.
A regiao de Crateus/Inhamuns foi escolhida por proximidade logistica. Consulte
`~/.claude/projects/-Users-keomamota-Contas-a-Receber/memory/` para mais contexto de negocio da
Nobre Lar (marca, outras iniciativas em andamento como o dashboard de cobranca).
