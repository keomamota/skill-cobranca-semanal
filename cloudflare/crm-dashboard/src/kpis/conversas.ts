import { parseUtc } from "./datas";

export const AGENTE = "NL Sales";

// Expressões que o agente NÃO pode mostrar ao cliente (R11.1). Lista editável.
export const FRASES_ERRO_AGENTE: RegExp[] = [
  /demorou mais do que o esperado/i,
  /instabilidade t[eé]cnica/i,
  /tente (enviar|novamente|de novo)/i,
  /n[aã]o consegui/i,
  /ocorreu um erro/i,
  /foi cancelada/i,
  /houve (um )?(erro|problema)/i,
];

// Heurística de passagem (R5.1): o agente avisa que um especialista assume. O Data Crazy não
// guarda o histórico de dono da conversa, então a frase é o único sinal no tempo.
const PASSAGEM = /vou (chamar|passar|confirmar com|transferir|verificar com)|(especialista|consultor|vendedor)s?[^.]{0,60}(vai|v[aã]o)[^.]{0,30}(continu|dar continuidade|assum|atend)|(chamar|passar)[^.]{0,20}(especialista|vendedor)/i;

export interface MsgConversa {
  createdAt: string;
  received: boolean;
  attendantName: string | null;
  body: string | null;
  isInternal?: boolean;
}

const MIN = 60000;
const FUSO_MS = 3 * 3600000; // Fortaleza = UTC-3, sem horário de verão

// Minutos dentro do expediente (seg-sex 7h-18h, sáb 7h-14h, domingo fechado) entre duas datas.
export function minutosUteis(inicioIso: string, fimIso: string): number {
  const s = parseUtc(inicioIso);
  const e = parseUtc(fimIso);
  if (!s || !e || e.getTime() <= s.getTime()) return 0;
  const ls = s.getTime() - FUSO_MS;
  const le = e.getTime() - FUSO_MS;
  let dia = Math.floor(ls / 86400000) * 86400000;
  let total = 0;
  while (dia <= le) {
    const dow = new Date(dia).getUTCDay();
    const fecha = dow === 0 ? 0 : dow === 6 ? 14 * 60 : 18 * 60;
    if (fecha > 0) {
      const ini = Math.max(ls, dia + 7 * 60 * MIN);
      const fim = Math.min(le, dia + fecha * MIN);
      if (fim > ini) total += (fim - ini) / MIN;
    }
    dia += 86400000;
  }
  return Math.round(total);
}

export interface AnaliseConversa {
  iniciadaPor: "cliente" | "loja" | null;
  minutosAteRespostaAgente: number | null;
  errosAgente: number;
  passagem: { em: string; humanoEm: string | null; minutosUteis: number } | null;
  clienteEsperandoDesde: string | null;
  minutosEsperando: number;
}

const ehAgente = (m: MsgConversa) => !m.received && m.attendantName === AGENTE;
const ehHumano = (m: MsgConversa) => !m.received && !!m.attendantName && m.attendantName !== AGENTE;

export function analisarConversa(todas: MsgConversa[], agora: Date): AnaliseConversa {
  const ms = todas
    .filter((m) => !m.isInternal && parseUtc(m.createdAt))
    .sort((a, b) => (parseUtc(a.createdAt)!.getTime() - parseUtc(b.createdAt)!.getTime()));
  if (ms.length === 0) {
    return { iniciadaPor: null, minutosAteRespostaAgente: null, errosAgente: 0, passagem: null, clienteEsperandoDesde: null, minutosEsperando: 0 };
  }
  const primeira = ms[0];
  const iniciadaPor = primeira.received ? "cliente" : "loja";

  let minutosAteRespostaAgente: number | null = null;
  if (iniciadaPor === "cliente") {
    const r = ms.find((m) => ehAgente(m));
    if (r) {
      minutosAteRespostaAgente =
        Math.round(((parseUtc(r.createdAt)!.getTime() - parseUtc(primeira.createdAt)!.getTime()) / MIN) * 10) / 10;
    }
  }

  const errosAgente = ms.filter((m) => ehAgente(m) && FRASES_ERRO_AGENTE.some((f) => f.test(m.body ?? ""))).length;

  let passagem: AnaliseConversa["passagem"] = null;
  const aviso = ms.find((m) => ehAgente(m) && PASSAGEM.test(m.body ?? ""));
  if (aviso) {
    const t0 = parseUtc(aviso.createdAt)!.getTime();
    const humano = ms.find((m) => ehHumano(m) && parseUtc(m.createdAt)!.getTime() > t0);
    passagem = {
      em: aviso.createdAt,
      humanoEm: humano ? humano.createdAt : null,
      minutosUteis: minutosUteis(aviso.createdAt, humano ? humano.createdAt : agora.toISOString()),
    };
  }

  // Cliente esperando = a conversa termina com mensagens do cliente; conta desde a primeira da sequência final.
  let clienteEsperandoDesde: string | null = null;
  let i = ms.length - 1;
  while (i >= 0 && ms[i].received) {
    clienteEsperandoDesde = ms[i].createdAt;
    i--;
  }
  const minutosEsperando = clienteEsperandoDesde ? minutosUteis(clienteEsperandoDesde, agora.toISOString()) : 0;

  return { iniciadaPor, minutosAteRespostaAgente, errosAgente, passagem, clienteEsperandoDesde, minutosEsperando };
}
