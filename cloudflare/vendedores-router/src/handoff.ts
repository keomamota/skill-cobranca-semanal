import { tratarConversaParada, type Dependencias } from "./endpoint";
import type { Msg } from "./repasse";

interface D1 {
  prepare(sql: string): { bind(...a: unknown[]): { all(): Promise<{ results?: any[] }>; first(): Promise<any>; run(): Promise<unknown> } };
}

export interface EnvHandoff {
  DB: D1;
  ROUTER_BEARER_TOKEN?: string;
}

export interface ArgsHandoff {
  env: EnvHandoff;
  agora: Date;
  dc: { call(tool: string, args: Record<string, unknown>): Promise<any> };
  /** userIds permitidos como destino (os mesmos do roteador). */
  destinos: string[];
  /** id de atendente de mensagem -> nome (o mesmo mapa do roteador). */
  mapaAtendentes: Record<string, string>;
  /**
   * userId do vendedor -> id da etiqueta REPASSE-<NOME> no Data Crazy. Ao trocar o dono do lead, o roteador coloca a
   * etiqueta e uma automação mínima do Data Crazy move a CONVERSA para o mesmo vendedor (a API não tem rota para isso).
   * Se informado, só entram como destino os vendedores que têm etiqueta (ou seja, que têm essa automação).
   */
  tagsRepasse?: Record<string, string>;
}

// Nunca recebem repasse: Francisco (pontuação baixa, decisão da Keoma) e quem saiu da equipe.
const FORA_DO_REPASSE = ["FRANCISCO MASCILON SOARES", "Camila Olinda", "Kayllane Soares"];
const MOTIVO = "repasse 10min";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function handoffAvaliar(req: Request, a: ArgsHandoff): Promise<Response> {
  const url = new URL(req.url);
  let leadId = url.searchParams.get("leadId");
  let atribuir = url.searchParams.get("atribuir") === "1";
  if (req.method === "POST") {
    // Formato do bloco de API do Data Crazy: POST com corpo JSON {"leadId": "...", "atribuir": true}.
    const corpo = (await req.clone().json().catch(() => ({}))) as { leadId?: string; atribuir?: unknown };
    leadId = leadId ?? corpo.leadId ?? null;
    if (corpo.atribuir === true || corpo.atribuir === 1 || corpo.atribuir === "1" || corpo.atribuir === "true") atribuir = true;
  }

  let linhas: { user_id: string; nome: string; score_final: number | null }[] = [];
  const deps: Dependencias = {
    token: a.env.ROUTER_BEARER_TOKEN,
    agora: a.agora,
    candidatos: async () => {
      const r = await a.env.DB.prepare("SELECT user_id, nome, score_final FROM pontuacao_vendedores").bind().all();
      linhas = (r.results ?? [])
        .filter((l) => a.destinos.includes(l.user_id) && !FORA_DO_REPASSE.includes(l.nome) && (!a.tagsRepasse || !!a.tagsRepasse[l.user_id]))
        .sort((x, y) => (y.score_final ?? 0) - (x.score_final ?? 0));
      return linhas.map((l) => l.nome);
    },
    tentativas: async (id) => {
      const r = await a.env.DB
        .prepare(`SELECT COUNT(*) AS n, MAX(roteado_em) AS ultimo FROM log_roteamento WHERE lead_id = ? AND motivo LIKE '${MOTIVO}%' AND roteado_em >= datetime('now','-1 day')`)
        .bind(id)
        .first();
      return { n: Number(r?.n ?? 0), ultimo: (r?.ultimo as string | null) ?? null };
    },
    jaPassaram: async (id) => {
      const r = await a.env.DB
        .prepare("SELECT DISTINCT p.nome AS nome FROM log_roteamento l JOIN pontuacao_vendedores p ON p.user_id = l.user_id_escolhido WHERE l.lead_id = ? AND l.roteado_em >= datetime('now','-2 day')")
        .bind(id)
        .all();
      return (r.results ?? []).map((x) => String(x.nome));
    },
    dc: {
      conversaPorLead: async (id) => {
        const convs = await a.dc.call("conversation_get_by_lead", { leadId: id });
        const c = (Array.isArray(convs) ? convs : [])
          .filter((x: any) => !x.isGroup)
          .sort((x: any, y: any) => Date.parse(y.lastMessageDate ?? 0) - Date.parse(x.lastMessageDate ?? 0))[0];
        if (!c) return null;
        const donos = (c.attendants ?? []).map((t: any) => a.mapaAtendentes[t.id] ?? t.name ?? null).filter(Boolean);
        return { id: String(c.id), finalizada: c.finished === true, donos };
      },
      mensagens: async (convId) => {
        const m = await a.dc.call("conversation_messages_list", { id: convId, limit: 80 });
        return (Array.isArray(m) ? m : []).map(
          (x: any): Msg => ({ createdAt: x.createdAt, received: x.received === true, attendantName: x.attendantName ?? null, isInternal: x.isInternal === true, deleted: x.deleted === true, body: typeof x.body === "string" ? x.body : null }),
        );
      },
      donoDoLead: async (id) => (await a.dc.call("lead_get", { id }))?.attendant?.name ?? null,
    },
  };

  const resp = await tratarConversaParada(req, deps);
  if (resp.status !== 200) return resp;
  const decisao = (await resp.json()) as { acao: string; proximo: string | null; [k: string]: unknown };
  if (!(atribuir && decisao.acao === "repassar" && decisao.proximo && leadId)) return json(decisao);

  const escolhido = linhas.find((l) => l.nome === decisao.proximo);
  if (!escolhido) return json({ ...decisao, acao: "fim", motivo: "erro_ao_atribuir" });
  try {
    await a.dc.call("lead_update_attendant", { id: leadId, userId: escolhido.user_id });
    const tagId = a.tagsRepasse?.[escolhido.user_id];
    if (tagId) {
      try {
        await a.dc.call("lead_add_tag", { id: leadId, tagIds: tagId });
      } catch {
        /* o lead já mudou de dono; sem a etiqueta só a conversa fica para trás (o vigia registra a conferência) */
      }
    }
    await a.env.DB
      .prepare("INSERT INTO log_roteamento (lead_id, user_id_escolhido, score_no_momento, motivo) VALUES (?,?,?,?)")
      .bind(leadId, escolhido.user_id, escolhido.score_final, `${MOTIVO} (${decisao.minutosSemResposta} min)`)
      .run();
  } catch {
    return json({ ...decisao, acao: "fim", motivo: "erro_ao_atribuir" });
  }
  return json(decisao);
}
