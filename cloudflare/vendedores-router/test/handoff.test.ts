import { describe, expect, it } from "vitest";
import { handoffAvaliar } from "../src/handoff";

const AGORA = new Date("2026-11-04T14:15:00Z"); // quarta 11:15 na loja
const DESTINOS = ["u-wes", "u-mik", "u-leo", "u-gei", "u-fra"];
const MAPA: Record<string, string> = { "att-gei": "Geicy Sousa", "att-nl": "NL Sales", "att-kay": "Kayllane Soares" };

function d1Falso(opcoes: { tentativas?: number; ultimo?: string | null; passaram?: string[] } = {}) {
  const log: { sql: string; args: unknown[] }[] = [];
  const sqls: string[] = [];
  return {
    log,
    sqls,
    prepare(sql: string) {
      sqls.push(sql);
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.includes("log_roteamento")) return { results: (opcoes.passaram ?? []).map((nome) => ({ nome })) };
              if (sql.includes("pontuacao_vendedores")) {
                return {
                  results: [
                    { user_id: "u-fra", nome: "FRANCISCO MASCILON SOARES", score_final: 90 },
                    { user_id: "u-mik", nome: "Mikhaell Machado", score_final: 80 },
                    { user_id: "u-leo", nome: "Leonardo Oliveira", score_final: 60 },
                    { user_id: "u-wes", nome: "wesley KT", score_final: 50 },
                    { user_id: "u-gei", nome: "Geicy Sousa", score_final: 40 },
                    { user_id: "u-kay", nome: "Kayllane Soares", score_final: 99 },
                  ],
                };
              }
              return { results: [] };
            },
            async first() {
              if (sql.includes("COUNT")) return { n: opcoes.tentativas ?? 0, ultimo: opcoes.ultimo ?? null };
              return null;
            },
            async run() {
              log.push({ sql, args });
              return {};
            },
          };
        },
      };
    },
  };
}

function dcFalso(over: { conversa?: any; msgs?: any[]; dono?: string | null } = {}) {
  const chamadas: { tool: string; args: any }[] = [];
  return {
    chamadas,
    async call(tool: string, args: any) {
      chamadas.push({ tool, args });
      if (tool === "conversation_get_by_lead")
        return over.conversa ?? [{ id: "c1", isGroup: false, finished: false, lastMessageDate: "2026-11-04T14:00:00Z", attendants: [{ id: "att-gei", name: "Geicy Sousa" }] }];
      if (tool === "conversation_messages_list")
        return over.msgs ?? [{ createdAt: "2026-11-04T14:00:00Z", received: true, attendantName: null, isInternal: false }];
      if (tool === "lead_get") return { attendant: over.dono === undefined ? { name: "Geicy Sousa", userId: "u-gei" } : over.dono ? { name: over.dono } : null };
      if (tool === "lead_update_attendant") return {};
      throw new Error("tool inesperada " + tool);
    },
  };
}

const pedido = (qs: string, auth: string | null = "Bearer segredo") =>
  new Request(`https://x/handoff/avaliar${qs}`, { headers: auth ? { Authorization: auth } : {} });

const base = (over: Partial<Parameters<typeof handoffAvaliar>[1]> = {}) => ({
  env: { DB: d1Falso() as any, ROUTER_BEARER_TOKEN: "segredo" },
  agora: AGORA,
  dc: dcFalso(),
  destinos: DESTINOS,
  mapaAtendentes: MAPA,
  ...over,
});

describe("handoffAvaliar", () => {
  it("exige o token do roteador", async () => {
    const r = await handoffAvaliar(pedido("?leadId=L1", null), base());
    expect(r.status).toBe(401);
  });

  it("repassa ao melhor do ranking que não seja o dono, o Francisco ou ex-vendedor", async () => {
    const r = await handoffAvaliar(pedido("?leadId=L1"), base());
    const j = await r.json();
    expect(j).toMatchObject({ acao: "repassar", proximo: "Mikhaell Machado", minutosSemResposta: 15 });
  });

  it("sem atribuir=1 só avisa: não mexe no lead nem registra", async () => {
    const dc = dcFalso();
    const env = { DB: d1Falso() as any, ROUTER_BEARER_TOKEN: "segredo" };
    await handoffAvaliar(pedido("?leadId=L1"), base({ dc, env }));
    expect(dc.chamadas.some((c) => c.tool === "lead_update_attendant")).toBe(false);
    expect((env.DB as any).log).toHaveLength(0);
  });

  it("com atribuir=1 troca o atendente do lead pelo userId do escolhido e registra a tentativa", async () => {
    const dc = dcFalso();
    const env = { DB: d1Falso() as any, ROUTER_BEARER_TOKEN: "segredo" };
    const r = await handoffAvaliar(pedido("?leadId=L1&atribuir=1"), base({ dc, env }));
    expect((await r.json()).acao).toBe("repassar");
    const upd = dc.chamadas.filter((c) => c.tool === "lead_update_attendant");
    expect(upd).toEqual([{ tool: "lead_update_attendant", args: { id: "L1", userId: "u-mik" } }]);
    expect((env.DB as any).log).toHaveLength(1);
    expect((env.DB as any).log[0].args).toContain("u-mik");
  });

  it("conta as tentativas só deste lead, só de repasses e só das últimas 24 h", async () => {
    const env = { DB: d1Falso() as any, ROUTER_BEARER_TOKEN: "segredo" };
    await handoffAvaliar(pedido("?leadId=L1"), base({ env }));
    const sql = (env.DB as any).sqls.find((q: string) => q.includes("COUNT")) as string;
    expect(sql).toContain("lead_id = ?");
    expect(sql).toContain("repasse 10min");
    expect(sql).toContain("-1 day");
  });

  it("aceita o formato do Data Crazy: POST com corpo {leadId, atribuir: true}", async () => {
    const dc = dcFalso();
    const env = { DB: d1Falso() as any, ROUTER_BEARER_TOKEN: "segredo" };
    const req = new Request("https://x/handoff/avaliar", {
      method: "POST",
      headers: { Authorization: "Bearer segredo", "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: "L9", atribuir: true }),
    });
    const r = await handoffAvaliar(req, base({ dc, env }));
    expect((await r.json()).acao).toBe("repassar");
    expect(dc.chamadas.filter((c) => c.tool === "lead_update_attendant")).toEqual([{ tool: "lead_update_attendant", args: { id: "L9", userId: "u-mik" } }]);
  });

  it("POST com atribuir ausente só avisa, não mexe no lead", async () => {
    const dc = dcFalso();
    const req = new Request("https://x/handoff/avaliar", {
      method: "POST",
      headers: { Authorization: "Bearer segredo", "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: "L9" }),
    });
    await handoffAvaliar(req, base({ dc }));
    expect(dc.chamadas.some((c) => c.tool === "lead_update_attendant")).toBe(false);
  });

  it("não repassa de novo enquanto o novo vendedor ainda está dentro dos 10 min (várias execuções em sequência)", async () => {
    const dc = dcFalso();
    const env = { DB: d1Falso({ tentativas: 1, ultimo: "2026-11-04 14:12:00" }) as any, ROUTER_BEARER_TOKEN: "segredo" };
    const r = await handoffAvaliar(pedido("?leadId=L1&atribuir=1"), base({ dc, env }));
    expect(await r.json()).toMatchObject({ acao: "fim", motivo: "dentro_do_prazo" });
    expect(dc.chamadas.some((c) => c.tool === "lead_update_attendant")).toBe(false);
  });

  it("depois de 8 tentativas, não repassa e não mexe no lead", async () => {
    const dc = dcFalso();
    const env = { DB: d1Falso({ tentativas: 8 }) as any, ROUTER_BEARER_TOKEN: "segredo" };
    const r = await handoffAvaliar(pedido("?leadId=L1&atribuir=1"), base({ dc, env }));
    expect(await r.json()).toMatchObject({ acao: "sem_atendimento", motivo: "limite_de_repasses" });
    expect(dc.chamadas.some((c) => c.tool === "lead_update_attendant")).toBe(false);
  });

  it("conversa que ainda está com o NL Sales: não faz nada", async () => {
    const dc = dcFalso({ conversa: [{ id: "c1", isGroup: false, finished: false, lastMessageDate: "2026-11-04T14:00:00Z", attendants: [{ id: "att-nl", name: "NL Sales" }] }] });
    const r = await handoffAvaliar(pedido("?leadId=L1&atribuir=1"), base({ dc }));
    expect(await r.json()).toMatchObject({ acao: "fim", motivo: "conversa_com_o_agente" });
    expect(dc.chamadas.some((c) => c.tool === "lead_update_attendant")).toBe(false);
  });

  it("identifica o dono da conversa pelo mapa de ids quando o nome não vem", async () => {
    const dc = dcFalso({ conversa: [{ id: "c1", isGroup: false, finished: false, lastMessageDate: "2026-11-04T14:00:00Z", attendants: [{ id: "att-kay" }] }], dono: "Kayllane Soares" });
    const r = await handoffAvaliar(pedido("?leadId=L1"), base({ dc }));
    expect((await r.json()).proximo).toBe("Mikhaell Machado");
  });

  it("falha na troca do lead: avisa o erro em vez de dizer que repassou", async () => {
    const dc = dcFalso();
    const original = dc.call;
    dc.call = async (tool: string, args: any) => {
      if (tool === "lead_update_attendant") throw new Error("HTTP 500");
      return original(tool, args);
    };
    const r = await handoffAvaliar(pedido("?leadId=L1&atribuir=1"), base({ dc }));
    expect(await r.json()).toMatchObject({ acao: "fim", motivo: "erro_ao_atribuir" });
  });

  it("com tagsRepasse: marca o lead com a etiqueta do escolhido e só considera quem tem etiqueta", async () => {
    const dc = dcFalso();
    dc.chamadas; // (mesmo falso de sempre; lead_add_tag precisa responder)
    const orig = dc.call.bind(dc);
    dc.call = async (tool: string, args: any) => (tool === "lead_add_tag" ? (dc.chamadas.push({ tool, args }), {}) : orig(tool, args));
    const env = { DB: d1Falso() as any, ROUTER_BEARER_TOKEN: "segredo" };
    // Mikhaell (melhor do ranking, sem etiqueta) fica de fora; sobra o wesley
    const r = await handoffAvaliar(pedido("?leadId=L1&atribuir=1"), base({ dc, env, tagsRepasse: { "u-wes": "tag-wes", "u-gei": "tag-gei" } }));
    expect((await r.json()).proximo).toBe("wesley KT");
    expect(dc.chamadas.filter((c) => c.tool === "lead_add_tag")).toEqual([{ tool: "lead_add_tag", args: { id: "L1", tagIds: "tag-wes" } }]);
  });

  it("nunca devolve o lead a quem já passou por ele (mesmo sem ter escrito ao cliente)", async () => {
    const env = { DB: d1Falso({ passaram: ["Mikhaell Machado"] }) as any, ROUTER_BEARER_TOKEN: "segredo" };
    const r = await handoffAvaliar(pedido("?leadId=L1"), base({ env }));
    expect((await r.json()).proximo).toBe("Leonardo Oliveira");
  });
});
