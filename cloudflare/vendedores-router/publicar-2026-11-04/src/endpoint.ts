import { decidirRepasse, type Msg } from "./repasse";

export interface ConversaDC {
  id: string;
  finalizada: boolean;
  /** Nomes dos atendentes atuais da conversa. */
  donos: string[];
}

export interface Dependencias {
  /** Segredo do roteador; sem ele o endpoint fica aberto (como o /rotear atual). */
  token?: string;
  agora: Date;
  /** Vendedores permitidos, do melhor ao pior do ranking. */
  candidatos: () => Promise<string[]>;
  /** Quantos repasses este lead já teve na espera atual e quando foi o último. */
  tentativas: (leadId: string) => Promise<number | { n: number; ultimo: string | null }>;
  /** Vendedores que já receberam este lead (qualquer rodízio/repasse) nos últimos dias: nunca voltam a ser destino. */
  jaPassaram?: (leadId: string) => Promise<string[]>;
  dc: {
    conversaPorLead: (leadId: string) => Promise<ConversaDC | null>;
    mensagens: (conversaId: string) => Promise<Msg[]>;
    donoDoLead: (leadId: string) => Promise<string | null>;
  };
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

const fim = (motivo: string) => json({ acao: "fim", motivo, minutosSemResposta: 0, proximo: null });

export async function tratarConversaParada(req: Request, d: Dependencias): Promise<Response> {
  if (d.token && req.headers.get("Authorization") !== `Bearer ${d.token}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  let leadId = url.searchParams.get("leadId");
  if (!leadId && req.method === "POST") leadId = ((await req.json().catch(() => ({}))) as { leadId?: string }).leadId ?? null;
  if (!leadId) return json({ acao: "fim", motivo: "leadId_obrigatorio" }, 400);

  try {
    const conversa = await d.dc.conversaPorLead(leadId);
    if (!conversa) return fim("sem_conversa");
    const mensagens = await d.dc.mensagens(conversa.id);
    const donoLead = await d.dc.donoDoLead(leadId);
    const ultimoHumano = [...mensagens]
      .filter((m) => !m.received && !m.isInternal && !m.deleted && m.attendantName && m.attendantName !== "NL Sales")
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]?.attendantName;
    const anteriores = d.jaPassaram ? await d.jaPassaram(leadId).catch(() => []) : [];
    const excluir = [...conversa.donos, ultimoHumano, donoLead, ...anteriores].filter((x): x is string => !!x);

    const t = await d.tentativas(leadId);
    const decisao = decidirRepasse({
      mensagens,
      agora: d.agora,
      tentativas: typeof t === "number" ? t : t.n,
      ultimoRepasseEm: typeof t === "number" ? null : t.ultimo,
      excluir,
      excluirAtuais: [...conversa.donos, ultimoHumano, donoLead].filter((x): x is string => !!x),
      candidatos: await d.candidatos(),
      finalizada: conversa.finalizada,
      donos: conversa.donos,
    });
    return json({ ...decisao, conversa: conversa.id });
  } catch {
    return fim("erro_ao_verificar");
  }
}
