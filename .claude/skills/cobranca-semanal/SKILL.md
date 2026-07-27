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
4. **Painel HTML (Artifact)** — dashboard visual com:
   - Filtros globais (afetam TUDO: kpis, graficos, lista): seletor de ano, atalho "excluir
     clientes JVM*" (o CEO tem forma de pagamento propria e polui a analise real da empresa se
     nao for excluido), e busca pra excluir qualquer cliente especifico da analise.
   - Comparativo de % de inadimplencia por ano lado a lado (com seta indicando se piorou ou
     melhorou), independente do ano selecionado no filtro principal.
   - Big numbers operacionais (inadimplencia do ano selecionado, mes vigente, vencendo 7 dias,
     cobertura de contato, variacao semanal).
   - Grafico de contas a receber por mes de vencimento (total faturado x recebido, com % de
     INADIMPLENCIA do mes no topo — nao confundir com % recebido, que e outra metrica: % de
     inadimplencia so considera o que ja venceu e ainda esta em aberto, dividido pelo que ja
     venceu; enquanto % recebido divide pelo total faturado do mes, incluindo parcelas futuras).
   - Grafico de inadimplencia por faixa de atraso (aging).
   - Feed de atividade recente da equipe de cobranca.
   - Lista de clientes agrupada (expansivel, com busca e filtro por status) mostrando o historico
     de tratativas de cada cliente.
   Todos os calculos (exceto CSVs e a variacao semanal) sao feitos no navegador a partir de uma
   lista crua de titulos (`titulos_raw` no JSON), nao vem prontos do servidor — e assim que o
   filtro de ano/cliente/JVM consegue recalcular tudo instantaneamente sem gerar o painel de novo.

## Achado importante (27/07/2026): % de inadimplencia esta muito alto (75-99% por mes)

Ao testar o comparativo, os numeros de inadimplencia por mes ficaram muito altos (ex: janeiro/2026
com 90%+ ainda em aberto, mesmo 6+ meses depois). Confirmei que o calculo bate com os dados crus:
a maioria dos titulos tem `Situacao=Aberta` e `Recebido=0` mesmo para meses ja bem antigos. Isso
pode significar (a) a inadimplencia realmente e essa alta, ou (b) a coluna Situacao/Recebido em
`db_contas_a_receber` nao esta sendo atualizada quando um titulo e pago (parecido com o problema
que ja aconteceu com `db_contasareceber` estar incompleta). **Nao assuma que e um bug do
script** — os numeros batem com os dados da planilha. Se a usuaria achar os numeros errados de
novo, o proximo passo e perguntar como/quando a coluna "Situacao" e atualizada no processo dela.

## db_clientes (telefone e vendedor)

A aba **"db_clientes"** tem o cadastro de clientes (telefone, vendedor responsavel, endereco) —
**quase 5 mil linhas**. As posicoes de coluna usadas no script (`POS_CLIENTE_*` em
`gerar_relatorio.py`, 0-indexado) foram confirmadas comparando o *valor* de cada coluna (formato
de data, CEP de 8 digitos, nome de vendedor conhecido) em varias linhas, nao so o texto do
cabecalho — em 26/07/2026 o cabecalho batia certinho com os dados (23 colunas), mas ja mudou de
estrutura uma vez antes disso. Se a aba mudar de novo, reconfirme da mesma forma antes de usar.

O painel usa isso para: mostrar o vendedor responsavel por cada cliente, e gerar um botao
"Chamar no WhatsApp" (link `wa.me`) quando o cliente tem telefone cadastrado.

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
- Abas usadas (nomes exatos das abas dentro da planilha, nao confundir com abas "de exibicao"
  parecidas que existem no mesmo arquivo):
  - **`db_contas_a_receber`** (com underscore) — fonte oficial dos titulos, **confirmada com a
    usuaria em 27/07/2026**. Colunas: Loja, Cliente, Numero, Descricao, Situacao
    (Aberta/Quitada/Estornada), Data de vencimento, Valor, A receber, Recebido. Titulos com
    Situacao="Estornada" sao excluidos (cancelados). Os valores vem como texto em formato
    americano (`"279.00"`, ponto decimal), nao brasileiro — `parse_valor()` tenta os dois formatos.
    Uma pequena quantidade de linhas (~30 de ~1800) tem erro de digitacao na planilha (data no
    lugar de valor numerico) — sao ignoradas com um aviso no stderr, nao travam o script.
    **Nao usar** `db_contasareceber` (sem underscore, ~430 linhas "curadas", incompleta — foi a
    fonte antiga, tinha julho/2026 com so 19 titulos/R$2.638 quando na verdade sao 247
    titulos/R$109 mil) nem a aba visual "Contas a Receber" (so um relatorio formatado).
  - **`db_clientes`** — cadastro de clientes (quase 5 mil linhas).
  - **`Tratativas`** — log de cobranca (ver secao acima).
- **Importante:** este script le a planilha via um arquivo `.xlsx` baixado por completo (ver
  Passo 1), nao via a ferramenta de "ler conteudo em texto" do Google Drive. Essa ferramenta
  (`read_file_content`) converte a planilha inteira pra markdown e **trunca por volta de
  100-110 linhas por tabela** — é inofensivo para tabelas pequenas (Tratativas) mas causa dados
  incompletos/errados em `db_contasareceber` (430 linhas) e principalmente em `db_clientes`
  (quase 5 mil linhas, ficava com <3% dos clientes lidos). Foi assim que descobrimos o problema:
  um cliente real com telefone cadastrado aparecia como "sem telefone" porque a leitura truncada
  nem chegava perto da linha dele.

## Passo a passo

1. **Baixar a planilha inteira como .xlsx.** Use a ferramenta de download do Google Drive
   (`download_file_content`, ou equivalente disponivel na sessao) passando o fileId
   `1Y0mq4JIk-tS0JftosgHplGYzOAwDsG09uMcVLnitTl8` e
   `exportMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`.
   - O resultado normalmente estoura o limite de tokens da ferramenta (arquivo grande) — isso e
     esperado, a propria ferramenta salva o JSON completo (campo `content`, base64) num arquivo
     temporario. Depois, decodifique o base64 e salve como `.xlsx` de verdade:
     ```bash
     python3 -c "
     import json, base64
     with open('<caminho_do_txt_salvo>') as f:
         data = json.load(f)
     with open('/tmp/planilha_nobre_lar.xlsx', 'wb') as f:
         f.write(base64.b64decode(data['content']))
     "
     ```
   - `openpyxl` precisa estar instalado (`pip3 install openpyxl` se necessario — funcionou sem
     configuracao extra na sessao onde isso foi construido).

2. **Rodar o script de extracao/filtragem.**

   ```bash
   python3 ".claude/skills/cobranca-semanal/scripts/gerar_relatorio.py" "/tmp/planilha_nobre_lar.xlsx" "relatorios"
   ```

   O script:
   - Le as tres abas (`db_contas_a_receber`, `db_clientes`, `Tratativas`) direto via `openpyxl`,
     sem limite de linhas e sem os problemas de alinhamento de cabecalho que a conversao pra
     texto causava.
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
