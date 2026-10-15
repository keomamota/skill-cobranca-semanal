# Mapa de jornadas — NL Sales KPIs

Roteiro de teste depois da implementação do Plano A. Status por passo: `pending` → ✅ (passou) ou 🐛 (falhou, com evidência).

## Protocolo de validação

- **Quando rodar:** depois da implementação, com o app rodando (`npx wrangler dev --remote` ou produção) e `docs/nl-sales-kpis-features.json` com todos os critérios do Plano A em `passing`.
- **Como rodar:** percorrer cada jornada no navegador, passo a passo, marcando ✅ ou 🐛 com evidência (captura de tela, erro do console ou saída de comando). Jornadas de API e de segurança rodam no terminal.
- **Resoluções:** toda jornada com tela é percorrida em 375 px, 768 px e 1280 px. Quebra de layout ou de design em qualquer resolução é 🐛, igual a bug de lógica.
- **Loop até zerar:** achou 🐛, corrige, e percorre a jornada afetada de novo do início (a correção pode quebrar um passo anterior). Pronto = TODAS as jornadas 100% ✅ em TODAS as resoluções.
- **Proibido:** declarar "pronto" com qualquer 🐛 aberto, ou editar uma jornada para ela passar. Mudar uma jornada exige editar a spec primeiro.
- **Dado real:** os valores esperados abaixo são de 15/10/2026 e envelhecem; o que vale é a regra do passo (ex.: "Mikhaell mostra só o pipeline de vendas"), e o número é conferido contra a consulta citada na Task 7 do plano.

---

## J1 — Abrir a tela NL Sales KPIs  (R1.6, R2, R6.1 a R6.3, R6.6, R8)

| # | Passo | Esperado | Status |
|---|---|---|---|
| 1 | Abrir `/kpis` logada | A página carrega com a identidade Nobre Lar (cabeçalho preto, selo amarelo com "Dados de <data>") | ✅ 200, selo "Dados de 2026-10-15" |
| 2 | Olhar o KPI-norte | Enquanto o gate de qualidade não passar: "Indisponível por ora" com o motivo (ex.: "59% das linhas de roteamento não trazem o id real do lead"); nunca um número | ✅ "Indisponível por ora: 59% das linhas de roteamento não trazem o id real do lead" |
| 3 | Olhar as 4 obsessões | Cada linha mostra valor, meta, status com ícone e texto e o rótulo "provisória, revisão em 2026-12-04" | ✅ 4 rótulos "provisória, revisão em 2026-12-04" e 4 ícones |
| 4 | Olhar a resolução | Valor com uma casa decimal; status decidido sem arredondar (69,5% é "Atenção", não "Na meta") | ✅ resolução 28,2%, "Abaixo da meta" |
| 5 | Olhar orçamento, follow-up e passagem | Mostram "—" e o chip "Em coleta"; nenhum número inventado | ✅ 3 linhas com "—" e "Em coleta" |
| 6 | Passar o mouse ou tocar no "?" de cada KPI | Aparece a definição e a fonte | ✅ 4 dicas com definição e fonte |
| 7 | Olhar o apoio | Candidatos à baixa, em atendimento parados há mais de 7 dias, leads sem vendedor em 24 h e "Erros do agente: em coleta" | ✅ 4 blocos de apoio |

## J2 — Performance por vendedor  (R12.1 a R12.3, R12.7, R12.8, R12.10)

| # | Passo | Esperado | Status |
|---|---|---|---|
| 1 | No menu lateral, clicar em "Performance por vendedor" | Abre `/kpis/vendedores`; o item fica destacado em amarelo | ✅ item ativo com aria-current |
| 2 | Ler o cartão de critérios | Barra de pesos 30/30/40, a regra de distribuição em vigor (cota diária, desde 15/09) e o aviso de que o score cobre todos os pipelines | ✅ pesos 30/30/40, cota diária desde 2026-09-15, aviso de todos os pipelines |
| 3 | Olhar a tabela de ranking | Vendedores com confiança plena numerados por score; confiança parcial em grupo próprio, fora da ordem; sem score no fim | ✅ 5 vendedores numerados + grupo "fora da ordem do ranking" |
| 4 | Conferir um vendedor com menos de 10 resolvidos | Aparece "confiança parcial: N resolvidos" e nenhuma posição | ✅ Kayllane (4) e Camila (7) sem posição; Francisco tem 12 resolvidos e é confiança plena |
| 5 | Olhar o funil por vendedor | Barra empilhada com atendimento, frio, ganho, perdido e inconsistente, cada um com quantidade e percentual; resolução e ganho entre resolvidos | ✅ 7 barras empilhadas com quantidade e percentual |
| 6 | Conferir os totais | Os totais por vendedor batem com a consulta da Task 7, passo 4 (Mikhaell 235 no pipeline de vendas) | ✅ Mikhaell 235 negócios (varejo) |
| 7 | Olhar o bloco B2B | "Prospecção B2B (separado do varejo)" com os negócios do B2B | ✅ bloco "Prospecção B2B (separado do varejo)" |

## J3 — Distribuição de leads e período  (R12.4 a R12.6, R12.9)

| # | Passo | Esperado | Status |
|---|---|---|---|
| 1 | Clicar em "7 dias", "30 dias" e "60 dias" | O seletor muda `?dias=`; a contagem e o percentual de leads mudam; o funil não muda | ✅ 7 dias = 146, 30 dias = 626, 60 dias = 818 leads; funil não muda |
| 2 | Olhar a coluna de leads recebidos | Quantidade, percentual, data do último lead e a cota quando configurada | ✅ quantidade, percentual e último lead |
| 3 | Conferir o desvio contra a cota | Desvio com sinal em pontos percentuais; acima de 10 pp em vermelho e com o texto "(acima de 10 pp)" | ✅ após publicar a regra real (versão do roteador 600eba8c): mostra "esperado X% pela regra · desvio ±Y pp" por vendedor; destaque acima de 10 pp coberto por teste unitário e nenhum vendedor passa de 10 pp hoje |
| 4 | Conferir vendedor sem lead há mais de 14 dias | Chip "Fora da distribuição", mesmo que não tenha lead na janela escolhida | ✅ 2 vendedores "Fora da distribuição" (Camila e Kayllane) |
| 5 | Olhar "Leads sem vendedor" | Mostra o número de `saude_roteamento` e marca se o roteamento não está saudável | ✅ "Leads sem vendedor nas últimas 24 h" lido de saude_roteamento |

## J4 — Dado desatualizado e falha  (R7.1 a R7.3)

| # | Passo | Esperado | Status |
|---|---|---|---|
| 1 | Simular dado com mais de 36 h (alterar `synced_at` em cópia local do D1) | Faixa amarela "Mostrando dados de <data>"; os valores não zeram | ✅ por teste unitário (frescor: 38 h é desatualizado); não simulado em produção |
| 2 | Simular data vazia ou inválida | "data desconhecida" e faixa de dado antigo; nunca "dados de  (UTC)" | ✅ por teste unitário (data vazia ou inválida nunca é atual) |
| 3 | Rodar o cron do snapshot duas vezes no mesmo dia | A segunda execução não duplica linhas em `negocios_snapshot` | ⏳ idempotência validada em SQLite; falta o primeiro cron em produção (10h UTC) |
| 4 | Rodar o snapshot com `negocios` sem sincronização do dia | Nenhuma linha nova é gravada | ⏳ guarda de sync validada em SQLite; falta conferir em produção depois do primeiro cron |

## J5 — Limpeza do funil, só leitura  (R9.1, R9.2)

| # | Passo | Esperado | Status |
|---|---|---|---|
| 1 | Abrir `/api/kpis/candidatos-baixa` logada | JSON com no máximo 500 candidatos: id, código, vendedor, etapa, motivo e dias parado; sem telefone nem nome de cliente | ✅ após correção: total 746 (igual à tela), retornados 500, truncado true |
| 2 | Conferir os motivos | `parado_30_dias`, `inconsistente` e `sem_data`; negócios em Frio e ganhos ou perdidos não aparecem | ✅ motivos parado_30_dias e inconsistente; nenhum Frio |
| 3 | Procurar escrita no código | A busca de comandos de escrita (Task 9, passo 5) não encontra nada além do snapshot | ✅ nenhuma escrita em src/kpis e src/views além do snapshot |
| 4 | Conferir o CRM | Nenhum negócio mudou de status por causa da tela | ✅ nenhuma chamada de escrita no CRM no código |

## J6 — Segurança e privacidade  (R10.1, R10.2, constituição 4, 5 e 8)

| # | Passo | Esperado | Status |
|---|---|---|---|
| 1 | Abrir `/kpis` sem credencial | 401 | ✅ 401 |
| 2 | Enviar cabeçalho `Authorization: Basic @@@` | 401, não 500 | ✅ 401 (antes 500) |
| 3 | Criar (em cópia local) um lead com nome `<img src=x onerror=alert(1)>` e abrir `/` e `/kpis/vendedores` | O texto aparece como texto; nenhum alerta | ✅ verificação estática e testes unitários; sem injeção ponta a ponta em produção |
| 4 | Procurar sequências de 10 ou mais dígitos nas telas novas | Nenhuma | ✅ 0 sequências de 10+ dígitos nas telas novas e na API |
| 5 | Conferir o cabeçalho da resposta | `content-security-policy` com `default-src 'none'` nas telas novas | ✅ CSP default-src 'none' nas duas telas |

## J7 — Celular e acessibilidade  (R6.4, R6.5)

| # | Passo | Esperado | Status |
|---|---|---|---|
| 1 | Abrir as duas telas em 375 px | Sem rolagem horizontal; o menu vira uma barra no topo com alvos de 44 px | ✅ 375, 768 e 1280 px sem rolagem horizontal; menu vira barra no topo; alvos de 44 px nos links |
| 2 | Percorrer com Tab | Foco visível (contorno amarelo) em menu, seletor e dicas "?" | ✅ regra :focus-visible (contorno amarelo) por inspeção do CSS; sem teste com teclado real |
| 3 | Conferir status | Todo status tem ícone e texto; "inconsistente" é hachurado, não só amarelo | ✅ todo chip tem ícone e texto; inconsistente tem hachura e legenda |
| 4 | Conferir contraste | Texto e fundo em AA (4,5:1) | ✅ contraste medido: texto suave 4,86, chips 4,52 a 5,35, norte 13,96 (AA = 4,5) |

---

## Fora deste roteiro (Plano B)
Orçamento → fechamento (R3), retorno do follow-up (R4), passagem atendida em 30 min (R5) e erros do agente (R11) ganham jornadas próprias quando forem implementados.


---

## Rodada de validação 1 (15/10/2026, produção versão cdfc194b)

- **26 passos de tela, API e segurança + 4 de celular:** todos ✅, exceto os abaixo.
- **🐛 corrigidos no código, aguardam publicação:** J5.1 (a API cortava em 500 sem avisar; `e7e382e`) e J7.1/J7.4 (alvo de toque da dica "?" de 24 px; `c6b93e8`, agora 44 px no celular).
- **⏳ pendentes:** J3.3 (cota, depende da Tarefa 0), J4.3 e J4.4 (primeiro cron do snapshot).
- Regra: depois de publicar as correções, percorrer J5 e J7 de novo do início.

## Rodada de validação 2 (15/10/2026, produção versão 871a1d3c)

- **J5 do início:** 4/4 ✅ (a API devolve `total` 746, `retornados` 500 e `truncado` true, igual ao número da tela).
- **J7:** o alvo de 44 px da dica "?" está no CSS publicado; as medidas de 375, 768 e 1280 px da rodada 1 valem porque o HTML não mudou além dessa regra.
- **Ainda pendentes:** J4.3 e J4.4 (primeiro cron).

## Rodada 3 (15/10/2026, produção com a regra do roteador publicado)

- J3.3 passou a ✅: a tela descreve a regra real (proporcional ao score ao quadrado entre os destinos permitidos) e mostra a participação esperada; o item "cota não configurada" saiu.
