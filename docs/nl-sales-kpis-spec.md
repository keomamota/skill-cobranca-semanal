# Spec — NL Sales KPIs (aba de métricas de obsessão do agente de vendas)

## Contexto
Aba nova no dashboard existente (`cloudflare/crm-dashboard`, Worker `nl-sales-crm-dashboard`, D1 `nl-sales-desempenho-vendedores`), que mostra 1 KPI-norte e 4 KPIs de obsessão do agente NL Sales e da passagem para o vendedor, com identidade visual da Nobre Lar. Insumos: [benchmark](nl-sales-kpis-benchmark.md), [status](nl-sales-kpis-planejamento-status.md). Dados: CRM Data Crazy (sincronizado no D1), log do follow-up urgente, horário comercial da Nobre Lar (seg–sex 7h–18h, sáb 7h–14h, Fortaleza).

**Escopo de dados ("funil ativo"):** pipeline "Vendas Nobre Lar", etapas Novo Lead, Qualificação, Orçamento e Negociação. "Frio" (1.178 abertos) é base estacionada e fica fora das taxas do funil ativo. "Clientes Perdidos" com status ainda aberto (525) é inconsistência a corrigir (R9).

## Requisitos

### R1 — KPI-norte: negócios ganhos por 100 leads novos
Como diretora, quero ver quantas vendas saem de cada 100 leads que chegam, para saber se o atendimento está convertendo.
- R1.1: O sistema DEVE definir lead novo como o lead roteado pela primeira vez na semana, com id real, sem duplicar o mesmo lead entre semanas. (Ajuste de 15/10: o D1 não guarda a primeira mensagem.)
- R1.6: SE menos de 80% das linhas de roteamento das últimas 8 semanas trouxerem o id real do lead, ou menos de 80% desses leads tiverem negócio, ENTÃO o sistema DEVE mostrar o KPI-norte como "indisponível" com o motivo, e NÃO DEVE mostrar a taxa.
- R1.2: O sistema DEVE agrupar leads em coortes semanais e contar como ganho o negócio com status "ganho" até 30 dias depois da entrada do lead.
- R1.3: ENQUANTO uma coorte tiver menos de 30 dias, o sistema DEVE exibi-la marcada como "parcial" e fora da média móvel.
- R1.4: O sistema DEVE exibir a série das últimas 12 coortes e o valor da coorte fechada mais recente.
- R1.5: SE a data de ganho não existir no CRM, ENTÃO o sistema DEVE usar a data do primeiro snapshot em que o negócio apareceu como ganho (R7.2).

### R2 — Taxa de resolução do funil ativo
Como gestora, quero saber quanto do funil está resolvido (ganho ou perdido), porque sem isso nenhuma conversão é confiável.
- R2.1: O sistema DEVE calcular a % de negócios do funil ativo (pipeline de vendas, fora de Frio) que estão como ganho ou perdido, contando no denominador todos os abertos de qualquer idade e, entre os resolvidos, os dos últimos 60 dias. (Ajuste de 15/10: o D1 não guarda a data de criação do negócio.)
- R2.2: O sistema DEVE listar, por vendedor, quantos negócios estão abertos há mais de 30 dias.
- R2.3: SE um negócio estiver numa etapa de perda mas com status aberto, ENTÃO o sistema DEVE contá-lo como "inconsistente" e NÃO como resolvido.

### R3 — Orçamento → fechamento
- R3.1: O sistema DEVE calcular, por coorte semanal de orçamentos, a % que virou ganho em até 30 dias.
- R3.2: O sistema DEVE mostrar o valor em R$ do orçamento ganho só quando o campo valor for diferente de zero, e o número de orçamentos sem valor ao lado.
- R3.3: QUANDO houver menos de 10 orçamentos na coorte, o sistema DEVE exibir "amostra pequena" em vez de uma taxa.

### R4 — Retorno do follow-up
(Revisado em 15/10/2026: a mensagem do follow-up urgente não vai mais ao grupo; a lista passa a ser a tag "🔴 Follow-up urgente" no CRM, atualizada 1 vez por dia às 9h.)
- R4.1: QUANDO a tag "Follow-up urgente" for aplicada a um lead, o sistema DEVE registrar o identificador do lead, o vendedor dono e a data de entrada na lista.
- R4.2: O sistema DEVE calcular a % dos leads que entraram na lista e responderam ou tiveram negócio movido em até 7 dias.
- R4.3: O sistema DEVE mostrar o resultado por vendedor, sem ranking público de punição.

### R5 — Passagem agente → vendedor atendida
- R5.1: O sistema DEVE considerar passagem o momento em que uma conversa atendida pelo NL Sales recebe um vendedor humano ou uma mensagem de vendedor é pedida pelo cliente.
- R5.2: O sistema DEVE considerar atendida a passagem com a primeira mensagem do vendedor humano em até 30 minutos de horário comercial.
- R5.3: SE a passagem ocorrer fora do horário comercial, ENTÃO o sistema DEVE contar os 30 minutos a partir da abertura seguinte.
- R5.4: O sistema DEVE mostrar a % atendida em ≤ 30 min e a lista das passagens atrasadas dos últimos 7 dias, por vendedor.
- R5.5: SE a conversa estiver na conta errada ("Leonardo"), ENTÃO o sistema DEVE sinalizá-la como "sem dono válido".

### R6 — Tela
- R6.1: A aba DEVE mostrar no topo o KPI-norte e as 4 obsessões, cada um com valor atual, meta provisória, cor (verde/amarelo/vermelho) e variação semanal.
- R6.2: Cada KPI DEVE exibir a definição em uma frase e a fonte do dado ao tocar/passar o mouse.
- R6.3: O sistema DEVE mostrar abaixo as métricas de apoio: tempo de 1ª resposta, leads parados > 7 dias, motivos de perda, passagens atrasadas e mensagens de erro do agente ao cliente (R11).
- R6.4: A tela DEVE usar a identidade visual da Nobre Lar e funcionar em 375 px, 768 px e 1280 px sem rolagem horizontal.
- R6.5: A tela DEVE manter contraste AA e nunca depender só de cor para indicar bom/ruim.
- R6.6: Metas provisórias DEVEM aparecer rotuladas "provisória, revisão em 04/12/2026".

### R7 — Dados
- R7.1: O sistema DEVE sincronizar os dados do CRM ao menos uma vez por dia útil, só por leitura.
- R7.2: O sistema DEVE gravar um snapshot diário (data, negócio, etapa, status, atendente) para reconstruir histórico.
- R7.3: SE a API do CRM falhar ou devolver lista vazia, ENTÃO o sistema DEVE manter o último dado bom e mostrar "dados de <data>", e NÃO zerar os KPIs.
- R7.4: O sistema DEVE guardar, por conversa, quem enviou cada mensagem (agente, vendedor ou cliente) para separar o que o agente atendeu sozinho.

### R8 — Metas
- R8.1: As metas DEVEM ficar em configuração editável, não no código da tela.
- R8.2: As metas iniciais DEVEM ser: resolução ≥ 70% em 30 dias; orçamento → fechamento 20% a 40%; retorno do follow-up 25% a 40%; passagem atendida ≥ 80% em ≤ 30 min; norte sem meta numérica até haver 8 semanas de coorte.

### R9 — Limpeza de funil (com aprovação)
- R9.1: O sistema DEVE gerar toda semana, sem alterar o CRM, a lista de negócios candidatos a baixa (parados > 30 dias, abaixo de um valor definido, e os 525 inconsistentes).
- R9.2: O sistema NUNCA DEVE marcar negócio como perdido sem aprovação explícita da Keoma.

### R11 — Erros do agente mostrados ao cliente (novo, 15/10/2026)
Como gestora, quero saber quantas vezes o agente contou ao cliente que "deu problema", porque a regra é nunca fazê-lo e passar direto ao especialista.
- R11.1: O sistema DEVE contar, por dia, as mensagens do NL Sales ao cliente que contêm expressões de erro (por exemplo "demorou mais do que o esperado", "instabilidade técnica", "tente novamente", "não consegui") e a lista de expressões DEVE ser editável.
- R11.2: O sistema DEVE mostrar a contagem do dia, da semana e a série de 12 semanas, com meta 0.
- R11.3: O sistema DEVE listar as conversas afetadas (primeiro nome, hora, vendedor dono atual) e marcar as que ainda estão sem vendedor humano.
- R11.4: SE uma conversa com erro do agente continuar sem vendedor humano por mais de 30 minutos de horário comercial, ENTÃO o sistema DEVE destacá-la como "perdida se ninguém assumir".

### R12 — Performance por vendedor, ranking de seleção e distribuição (novo, 15/10/2026)
Como diretora, quero ver, por vendedor, como ele está, que critérios decidem quem recebe os próximos leads e como os leads estão distribuídos até o fechamento ou a perda.
- R12.1: O sistema DEVE exibir uma nova entrada "Performance por vendedor" no menu lateral vertical, na mesma aba de KPIs do dashboard.
- R12.2: O sistema DEVE listar, para cada vendedor ativo na janela de 60 dias: negócios, ganhos, perdidos, resolvidos, taxa de resolução, taxa de ganho suavizada, mediana de resposta, os três scores (velocidade, resolução, ganho), o score final e o nível de confiança.
- R12.3: O sistema DEVE explicar, em linguagem simples e na própria tela, (a) como o score é calculado (pesos 30% velocidade, 30% resolução e 40% ganho; confiança plena a partir de 10 resolvidos em 60 dias) e (b) a regra de distribuição EM VIGOR, lida do código publicado do roteador: a cada lead vai para quem está mais atrás da sua parte do dia, e a parte de cada vendedor permitido é proporcional ao score ao quadrado; quem não está na lista de destinos (hoje Camila e Kayllane) não recebe lead. A tela NÃO DEVE descrever uma regra que não esteja publicada.
- R12.4: O sistema DEVE mostrar, por vendedor, a quantidade e o percentual de leads recebidos no período (7, 30 ou 60 dias, à escolha) e a data do último lead recebido.
- R12.5: O sistema DEVE mostrar, por vendedor, a participação esperada pela regra publicada (score ao quadrado normalizado entre os destinos permitidos) ao lado da participação real, e destacar a diferença quando passar de 10 pontos percentuais.
- R12.6: SE um vendedor estiver há mais de 14 dias sem receber lead, ENTÃO o sistema DEVE marcá-lo como "fora da distribuição" com a data do último lead.
- R12.7: O sistema DEVE mostrar, por vendedor, a distribuição dos negócios por situação: em atendimento (Novo Lead, Qualificação, Orçamento, Negociação), Frio, Ganho, Perdido e Inconsistente, cada um em quantidade e em percentual do total do vendedor.
- R12.8: QUANDO o vendedor tiver menos de 10 resolvidos, o sistema DEVE marcá-lo com "confiança parcial" e NÃO DEVE mostrá-lo como pior ou melhor que os demais.
- R12.9: O sistema DEVE mostrar a quantidade de leads ainda sem vendedor.
- R12.10: O sistema DEVE usar uma definição única de "negócio da janela" para as contagens por vendedor (pipeline "Vendas Nobre Lar": todos os abertos mais os ganhos e perdidos dos últimos 60 dias). Os scores vêm do roteador, calculados sobre todos os pipelines, e a tela DEVE avisar isso. O pipeline "Prospecção B2B" aparece em bloco separado.

### R10 — Acesso e privacidade
- R10.1: A aba DEVE ficar atrás da mesma autenticação do dashboard.
- R10.2: O sistema DEVE mascarar telefones e mostrar só o primeiro nome do cliente nas listas.

## Fora de escopo
- Ticket médio, recompra e faturamento em R$ pelo Hiper (por enquanto: o CRM não tem valor confiável e o Hiper não tem CPF).
- Envio dos KPIs por WhatsApp (por enquanto: a sessão do número está sob observação).
- Mudar o prompt ou o comportamento do agente NL Sales (nunca nesta entrega).
- Baixa automática de negócios (nunca).
- Ranking público ou punitivo por vendedor (nunca).
- Comparação com benchmark externo dentro da tela (por enquanto).

## Clarifications
- 09/10/2026 — Q: Qual é o ponteiro? A: vendas fechadas e conversão lead → venda, atribuídas ao atendimento (escolha delegada à IA, aprovada).
- Q: Escopo? A: agente + passagem para o vendedor. Q: Onde? A: nova aba no dashboard atual (opção A). Q: Quantos KPIs? A: 1 norte + 4 obsessão.
- 15/10/2026 — Q: B2B junto ou separado no funil? A: separado (decisão da Keoma). Q: lead_id = "agente" no log: o KPI-norte fica indisponível até a origem ser corrigida (padrão adotado).
- 15/10/2026 — Q: Variação? A: 1 (faixa preta + placar). Q: Nova entrada no menu? A: "Performance por vendedor" com KPIs do ranking de seleção e distribuição de leads até fechamento/perda (R12).
- 15/10/2026 — Q: Layout? A: A + C (norte em faixa preta e obsessões em placar). Q: Incluir R4 revisado e R11? A: sim.
- Q: Meta da passagem? A: 30 min (o mercado cita 5 a 10 min; time pequeno e loja presencial).
- **Correção do diagnóstico inicial (09/10):** eu havia dito que 84% do funil estava sem resolução. Ao separar o funil ativo, a base estacionada em "Frio" (1.178) e os 525 "Clientes Perdidos" ainda abertos explicam a maior parte. Linha de base corrigida: funil ativo aberto ≈ 519 negócios (Novo Lead 396, Qualificação 79, Orçamento 10, Negociação 7, Ganho ainda aberto 27). A taxa de ganho entre resolvidos é 45% só pela contagem oficial; se os 525 forem contados como perdidos, cai para cerca de 20%, o que bate com os benchmarks (18% a 21%).

## Premissas e gatilhos de replanejamento
| Premissa | Gatilho | O que revisitar |
|---|---|---|
| O CRM expõe a data de ganho ou o snapshot basta | Data de ganho incorreta em > 10% dos casos | R1.5 e a tabela de snapshots |
| Cerca de 30 leads novos/dia ou menos | > 300 conversas/dia | custo de leitura de mensagens (R7.4) e plano do D1 |
| A API do Data Crazy aguenta a leitura diária | Erros 403 recorrentes | frequência e janela de sync |
| Metas do mercado servem de ponto de partida | 8 semanas de dado próprio (04/12/2026) | todas as metas de R8.2 |
| Cálculo atual conta negócios por last_moved_at e o score por outra regra (Mikhaell: 383 x 232) | Primeira implementação | R12.10: unificar a definição da janela |
| A distribuição em produção é por cota diária (confirmado em log_roteamento: 481 leads "cota diaria (transferencia do agente)" desde 17/09) e o código publicado não está no repositório local | Antes de implementar R12.3 e R12.5 | ler a cota configurada no Worker publicado e trazer o código para o repositório |
| "Frio" continua sendo base estacionada | Equipe passar a trabalhar essa base | escopo do funil ativo |
