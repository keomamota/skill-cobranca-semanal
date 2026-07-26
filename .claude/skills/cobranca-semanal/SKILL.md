---
name: cobranca-semanal
description: Gera o painel de cobranca (dashboard HTML com KPIs, graficos, lista de clientes inadimplentes e historico de tratativas) + CSVs de apoio (inadimplentes do mes vigente, inadimplencia total do ano por cliente, vencimentos dos proximos 7 dias) a partir das abas "Contas a Receber" e "Tratativas" da planilha do Google Sheets. Use quando o usuario pedir o relatorio ou painel de inadimplencia, cobranca, contas a receber, recuperacao de credito, ou vencimentos a vencer.
---

# Cobranca semanal - Contas a Receber

Gera um painel HTML de cobranca e tres relatorios CSV de apoio a partir da planilha:

1. **Inadimplentes do mes vigente** — titulos com vencimento no mes atual, ja vencidos (data de
   vencimento < hoje) e ainda com saldo em aberto (nao quitados).
2. **Vencimentos dos proximos 7 dias corridos** — titulos com vencimento entre hoje e hoje+7 dias,
   ainda com saldo em aberto.
3. **Inadimplencia total do ano vigente** — todos os titulos vencidos (de qualquer mes do ano
   atual, nao so o mes vigente) que ainda tem saldo em aberto, agrupados por cliente com subtotal
   por cliente. Esta lista existe para a equipe de cobranca trabalhar cliente a cliente (ligar,
   cobrar), nao so o atraso recente — inclui todo o historico de inadimplencia acumulada do ano.
4. **Painel HTML (Artifact)** — dashboard visual com big numbers, grafico de contas a receber por
   mes de vencimento, grafico de inadimplencia por faixa de atraso (aging), feed de atividade
   recente da equipe de cobranca, e lista de clientes agrupada (expansivel, com busca e filtro por
   status) mostrando o historico de tratativas de cada cliente. Pensado para a diretora acompanhar
   o trabalho da equipe de cobranca e para a equipe registrar o resultado de cada contato.

## db_clientes (telefone e vendedor)

A aba **"db_clientes"** tem o cadastro de clientes (telefone, vendedor responsavel, endereco).
O cabecalho de texto dessa aba **nao bate 1-para-1 com o conteudo real das colunas** (parece
ter sido editada manualmente ao longo do tempo) — as posicoes usadas no script
(`POS_CLIENTE_*` em `gerar_relatorio.py`) foram confirmadas comparando o *valor* de cada coluna
(formato de data, CEP de 8 digitos, nome de vendedor conhecido) em varias linhas, nao o texto do
cabecalho. Se a aba mudar de estrutura, reconfirme da mesma forma antes de usar as posicoes.

O painel usa isso para: mostrar o vendedor responsavel por cada cliente, e gerar um botao
"Chamar no WhatsApp" (link `wa.me`) quando o cliente tem telefone cadastrado. **Cobertura atual
e baixa** (~90 clientes cadastrados em db_clientes vs. ~106 clientes inadimplentes no momento
deste teste, com so 1 nome batendo entre as duas listas) — a maioria dos cards vai mostrar "Sem
telefone cadastrado" ate que db_clientes seja expandida para cobrir a base toda de clientes.

## Tratativas (registro de cobranca)

A equipe registra o resultado de cada contato de cobranca **diretamente na planilha**, numa aba
separada chamada **"Tratativas"** (colunas: `Data | Cliente | Status | Tratativa | Autor`). O
painel HTML le essa aba e mostra o historico por cliente; cada cliente no painel tem um botao
"Registrar tratativa na planilha" que abre essa aba direto (link com `#gid=<gid_tratativas>`).

Nao existe hoje uma forma de o painel HTML guardar dados digitados nele mesmo e mostrar isso para
outras pessoas (Artifacts nao tem uma capacidade de estado compartilhado disponivel) — por isso a
planilha e o "banco de dados" real, e o painel e sempre uma leitura (regenerado a cada execucao).

## Fonte de dados

- Planilha Google Sheets, ID: `1Y0mq4JIk-tS0JftosgHplGYzOAwDsG09uMcVLnitTl8`
- Aba usada: **"Contas a Receber"** (gid=1625209165)
- A planilha inteira (todas as abas) e retornada como um unico texto em markdown pela ferramenta
  de leitura do Google Drive. Dentro desse texto, a aba "Contas a Receber" aparece como **varios
  blocos de tabela** (um bloco por mes de vencimento), todos com o mesmo cabecalho de 5 colunas:

  ```
  | DATA DE EMISSÃO | CLIENTES | VALOR ORIGINAL | VALOR EM ABERTO | DATA DE VENCIMENTO |
  ```

  Ha tambem uma tabela "mestre" mais antiga, com colunas extras (mes, ano, Recebimentos), que para
  de ser atualizada em maio/2026 — **ignore essa tabela mestre**, ela e obsoleta. O script
  `scripts/gerar_relatorio.py` ja identifica e usa apenas os blocos de 5 colunas.

## Passo a passo

1. **Buscar o conteudo da planilha.** Use a ferramenta de leitura de arquivo do Google Drive
   (`read_file_content`, ou equivalente disponivel na sessao) passando o fileId
   `1Y0mq4JIk-tS0JftosgHplGYzOAwDsG09uMcVLnitTl8`.
   - O conteudo e grande (~400 mil caracteres) e normalmente estoura o limite de tokens da
     ferramenta. Isso e esperado: a propria ferramenta salva o JSON completo em um arquivo
     temporario e informa o caminho no erro (ex: `.../tool-results/mcp-...-read_file_content-...txt`).
     Use esse caminho no passo seguinte. Nao tente ler o conteudo inteiro manualmente.

2. **Rodar o script de extracao/filtragem.**

   ```bash
   python3 ".claude/skills/cobranca-semanal/scripts/gerar_relatorio.py" "<caminho_do_json_salvo>" "relatorios"
   ```

   O script (puro Python, sem dependencias externas):
   - Extrai todos os registros dos blocos de 5 colunas da aba Contas a Receber (dedup automatico)
     e da aba Tratativas.
   - Usa a data atual do sistema como "hoje" (pode-se passar uma data manualmente como terceiro
     argumento `YYYY-MM-DD`, so para testes).
   - Filtra e separa em "inadimplentes do mes vigente", "vencimentos proximos 7 dias corridos" e
     "inadimplencia total do ano" (esta ultima e um superconjunto da primeira: todo mes vencido do
     ano atual, nao so o vigente).
   - Calcula series mensais (contas a receber por mes de vencimento) e faixas de atraso (aging).
   - Atualiza `relatorios/historico.json` (append) para calcular a variacao da divida entre
     execucoes (semana a semana).
   - Salva tres arquivos CSV em `relatorios/` (inadimplentes, proximos 7 dias, inadimplencia total
     por cliente) e um `dashboard_data_YYYY-MM-DD.json` com tudo consolidado para o painel.

3. **Gerar o painel HTML.**

   ```bash
   python3 ".claude/skills/cobranca-semanal/scripts/build_dashboard_html.py" \
     "relatorios/dashboard_data_YYYY-MM-DD.json" "relatorios" \
     "1Y0mq4JIk-tS0JftosgHplGYzOAwDsG09uMcVLnitTl8" "<gid_da_aba_tratativas>" \
     "11.084.977/0001-50" "Nobre Lar"
   ```

   O gid da aba "Tratativas" e `786917158` (confirmado com o usuario) — so pergunte de novo se a
   aba for recriada e o gid mudar. Os dois ultimos argumentos (chave PIX e nome do beneficiario)
   sao opcionais — se omitidos, o script usa os valores padrao acima (ja confirmados com o
   usuario). Isso gera `relatorios/painel_cobranca_YYYY-MM-DD.html`, um arquivo HTML autocontido
   (sem dependencias externas, CSP-safe), com botao "Chamar no WhatsApp" por cliente (quando ha
   telefone cadastrado em db_clientes) trazendo uma mensagem pronta com valor da divida e a chave
   PIX, para o cliente conseguir pagar na hora, nao so "abrir uma conversa".

4. **Publicar o painel** com a ferramenta Artifact — **o link precisa ser o mesmo todo mes/semana**
   (a funcionaria e a diretora vao favoritar esse link, ele nao pode mudar a cada execucao).
   - Verifique se existe `.claude/skills/cobranca-semanal/artifact_url.txt`. Se existir, chame o
     Artifact passando esse valor no parametro `url` (isso atualiza a mesma pagina publicada em
     vez de criar uma nova).
   - Se nao existir (primeira vez), publique normalmente (sem `url`), e depois salve a URL retornada
     em `.claude/skills/cobranca-semanal/artifact_url.txt` para as proximas execucoes usarem.

5. **Reportar ao usuario** um resumo curto (quantos titulos e valor total em cada lista, link do
   painel publicado) e os caminhos dos arquivos gerados em `relatorios/`.

## Observacoes

- "Saldo em aberto" (`VALOR EM ABERTO`) e o criterio de quitacao: se for 0 (ou muito proximo de
  zero), o titulo esta pago e deve ser ignorado — o script ja faz isso.
- Os valores usam formato brasileiro (`R$ 1.234,56`) tanto na planilha quanto nos CSVs gerados.
- Datas no formato `dd/mm/aaaa`.
- Nao ha envio automatico (e-mail, WhatsApp etc.) — o usuario pediu apenas os arquivos salvos
  localmente + o painel publicado como Artifact. Nao tente enviar os arquivos por conta propria.
- `relatorios/` esta no `.gitignore` (CSVs, JSON e HTML com dados de clientes nao devem ir para o
  historico do git — sao sempre regenerados a cada execucao), **exceto `relatorios/historico.json`**,
  que fica versionado de proposito: ele so guarda totais agregados por data (sem dado de cliente
  individual) e precisa sobreviver entre execucoes para calcular a variacao semanal da divida —
  inclusive se a skill rodar num ambiente efemero (ex: agente de nuvem sem disco persistente).
