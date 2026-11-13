import { minutosUteis, parseUtc } from "./horario";

export interface Msg {
  createdAt: string;
  received: boolean;
  attendantName: string | null;
  isInternal?: boolean;
  deleted?: boolean;
  /** Texto da mensagem (usado só para reconhecer assunto de pedido/entrega já feito). */
  body?: string | null;
}

export interface EntradaRepasse {
  mensagens: Msg[];
  agora: Date;
  /** Quantos repasses já foram feitos nesta espera. */
  tentativas: number;
  /** Nomes que não podem receber (já tentaram, saíram da equipe, ausentes). */
  excluir: string[];
  /** Vendedores que estão com o lead agora (não repassar a eles nem no ciclo de volta). */
  excluirAtuais?: string[];
  /** Vendedores permitidos, do melhor ao pior do ranking. */
  candidatos: string[];
  limiteMin?: number;
  /** Conversa já finalizada no Data Crazy. */
  finalizada?: boolean;
  /** Atendentes atuais da conversa (nomes). */
  donos?: string[];
  /** Quando foi o último repasse deste lead (o relógio do novo vendedor começa aí). */
  ultimoRepasseEm?: string | null;
}

export interface DecisaoRepasse {
  acao: "fim" | "repassar" | "sem_atendimento";
  motivo: string;
  minutosSemResposta: number;
  proximo: string | null;
}

export const LIMITE_MINUTOS = 10;
export const MAX_REPASSES = 8;
export const AGENTE = "NL Sales";

/**
 * Frases do NL Sales quando encaminha um assunto de PEDIDO/ENTREGA já feito ao vendedor da compra.
 * Nesses casos o cliente tem um vendedor específico para resolver; repassar a outro só atrapalha.
 */
export const PEDIDO_EXISTENTE = /consultar sua entrega|localizando seu pedido|equipe de log[ií]stica|status d[ao] (seu )?(pedido|entrega)|rastre/i;

export function decidirRepasse(e: EntradaRepasse): DecisaoRepasse {
  const limite = e.limiteMin ?? LIMITE_MINUTOS;
  const fim = (motivo: string): DecisaoRepasse => ({ acao: "fim", motivo, minutosSemResposta: 0, proximo: null });
  if (e.finalizada) return fim("conversa_finalizada");
  if (e.donos?.includes(AGENTE)) return fim("conversa_com_o_agente");
  const msgs = e.mensagens
    // Mensagem automática (boas-vindas, bot) vem sem atendente e a fala do próprio agente ("ele já assume") também não é resposta de vendedor.
    .filter((m) => m && !m.deleted && !m.isInternal && parseUtc(m.createdAt) && (m.received || (!!m.attendantName && m.attendantName !== AGENTE)))
    .sort((a, b) => parseUtc(a.createdAt)!.getTime() - parseUtc(b.createdAt)!.getTime());

  // Cliente esperando = a conversa termina com mensagens do cliente; conta desde a primeira da sequência final.
  let esperando: Msg | null = null;
  let corrida: Msg[] = [];
  for (let i = msgs.length - 1; i >= 0 && msgs[i].received; i--) {
    esperando = msgs[i];
    corrida.unshift(msgs[i]);
  }
  if (!esperando) return { acao: "fim", motivo: "cliente_nao_esta_esperando", minutosSemResposta: 0, proximo: null };

  // As falas do agente saem de `msgs`, então a sequência do cliente pode atravessar mensagens que o agente JÁ respondeu.
  // A espera por um VENDEDOR só começa na passagem do agente ou na primeira mensagem do cliente depois dela.
  const falasAgente = e.mensagens.filter((m) => m && !m.deleted && !m.isInternal && !m.received && m.attendantName === AGENTE && parseUtc(m.createdAt));
  falasAgente.sort((a, b) => parseUtc(a.createdAt)!.getTime() - parseUtc(b.createdAt)!.getTime());
  const ultimaAgente = falasAgente[falasAgente.length - 1];
  let inicio = esperando.createdAt;
  if (ultimaAgente && parseUtc(ultimaAgente.createdAt)!.getTime() > parseUtc(inicio)!.getTime()) {
    const depois = corrida.find((m) => parseUtc(m.createdAt)!.getTime() > parseUtc(ultimaAgente.createdAt)!.getTime());
    inicio = depois ? depois.createdAt : ultimaAgente.createdAt;
  }

  // Pedido/entrega já feito: o agente já apontou o vendedor da compra; não se repassa a outro.
  if (falasAgente.slice(-15).some((m) => PEDIDO_EXISTENTE.test(m.body ?? ""))) {
    return { acao: "fim", motivo: "pedido_ou_entrega_existente", minutosSemResposta: 0, proximo: null };
  }

  const ref = e.ultimoRepasseEm && parseUtc(e.ultimoRepasseEm)!.getTime() > parseUtc(inicio)!.getTime() ? e.ultimoRepasseEm : inicio;
  const minutos = minutosUteis(ref, e.agora.toISOString());
  if (minutos < limite) return { acao: "fim", motivo: "dentro_do_prazo", minutosSemResposta: minutos, proximo: null };

  if (e.tentativas >= MAX_REPASSES) {
    return { acao: "sem_atendimento", motivo: "limite_de_repasses", minutosSemResposta: minutos, proximo: null };
  }
  // Prefere quem ainda não pegou o lead; se todos já pegaram, volta ao ciclo (só não repassa a quem está com ele agora).
  const proximo = e.candidatos.find((c) => !e.excluir.includes(c)) ?? e.candidatos.find((c) => !(e.excluirAtuais ?? e.excluir).includes(c)) ?? null;
  if (!proximo) return { acao: "sem_atendimento", motivo: "sem_candidato", minutosSemResposta: minutos, proximo: null };
  return { acao: "repassar", motivo: "vendedor_demorou", minutosSemResposta: minutos, proximo };
}
