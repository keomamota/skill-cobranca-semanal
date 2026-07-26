---
name: cobranca-semanal
description: Gera o relatorio de cobranca (inadimplentes do mes vigente + vencimentos dos proximos 7 dias corridos) a partir da aba "Contas a Receber" da planilha do Google Sheets, e salva os arquivos CSV na pasta relatorios/. Use quando o usuario pedir o relatorio de inadimplencia, cobranca, contas a receber, ou vencimentos a vencer.
---

# Cobranca semanal - Contas a Receber

Gera dois relatorios a partir da planilha de Contas a Receber:

1. **Inadimplentes do mes vigente** — titulos com vencimento no mes atual, ja vencidos (data de
   vencimento < hoje) e ainda com saldo em aberto (nao quitados).
2. **Vencimentos dos proximos 7 dias corridos** — titulos com vencimento entre hoje e hoje+7 dias,
   ainda com saldo em aberto.

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
   - O conteudo e grande (~390 mil caracteres) e normalmente estoura o limite de tokens da
     ferramenta. Isso e esperado: a propria ferramenta salva o JSON completo em um arquivo
     temporario e informa o caminho no erro (ex: `.../tool-results/mcp-...-read_file_content-...txt`).
     Use esse caminho no passo seguinte. Nao tente ler o conteudo inteiro manualmente.

2. **Rodar o script de extracao/filtragem.**

   ```bash
   python3 ".claude/skills/cobranca-semanal/scripts/gerar_relatorio.py" "<caminho_do_json_salvo>" "relatorios"
   ```

   O script (puro Python, sem dependencias externas):
   - Extrai todos os registros dos blocos de 5 colunas da aba Contas a Receber (dedup automatico).
   - Usa a data atual do sistema como "hoje" (pode-se passar uma data manualmente como terceiro
     argumento `YYYY-MM-DD`, so para testes).
   - Filtra e separa em "inadimplentes do mes vigente" e "vencimentos proximos 7 dias corridos".
   - Salva dois arquivos CSV em `relatorios/`:
     - `inadimplentes_YYYY-MM-DD.csv`
     - `vencimentos_proximos_7_dias_YYYY-MM-DD.csv`
   - Imprime um resumo JSON com quantidade de titulos e total em R$ de cada lista.

3. **Reportar ao usuario** um resumo curto (quantos titulos e valor total em cada lista) e os
   caminhos dos arquivos gerados em `relatorios/`.

## Observacoes

- "Saldo em aberto" (`VALOR EM ABERTO`) e o criterio de quitacao: se for 0 (ou muito proximo de
  zero), o titulo esta pago e deve ser ignorado — o script ja faz isso.
- Os valores usam formato brasileiro (`R$ 1.234,56`) tanto na planilha quanto nos CSVs gerados.
- Datas no formato `dd/mm/aaaa`.
- Nao ha envio automatico (e-mail, WhatsApp etc.) — o usuario pediu apenas os arquivos salvos
  localmente. Nao tente enviar os arquivos por conta propria.
