import { describe, expect, it } from "vitest";
import { dentroDoExpediente, varrerRepasses } from "../src/vigia";

const AGORA = new Date("2026-11-04T14:15:00Z"); // quarta 11:15 na loja
const MAPA: Record<string, string> = { "att-gei": "Geicy Sousa", "att-nl": "NL Sales" };

function d1(modo?: string) {
  const inserts: { sql: string; args: unknown[] }[] = [];
  return {
    inserts,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.includes("log_roteamento")) return { results: [] };
              if (sql.includes("pontuacao_vendedores"))
                return { results: [
                  { user_id: "u-mik", nome: "Mikhaell Machado", score_final: 80 },
                  { user_id: "u-gei", nome: "Geicy Sousa", score_final: 40 },
                ] };
              return { results: [] };
            },
            async first() {
              if (sql.includes("vigia_config")) return modo ? { valor: modo } : null;
              if (sql.includes("COUNT")) return { n: 0, ultimo: null };
              return null;
            },
            async run() {
              inserts.push({ sql, args });
              return {};
            },
          };
        },
      };
    },
  };
}

const conv = (leadId: string, ultima: string, over: any = {}) => ({
  id: "c-" + leadId, leadId, isGroup: false, finished: false, lastMessageDate: ultima,
  attendants: [{ id: "att-gei", name: "Geicy Sousa" }], ...over,
});

function dc(lista: any[]) {
  const chamadas: { tool: string; args: any }[] = [];
  return {
    chamadas,
    async call(tool: string, args: any) {
      chamadas.push({ tool, args });
      if (tool === "conversation_list") return { data: lista };
      if (tool === "conversation_get_by_lead") return [conv(args.leadId, "2026-11-04T14:00:00Z")];
      if (tool === "conversation_messages_list") return [{ createdAt: "2026-11-04T14:00:00Z", received: true, attendantName: null, isInternal: false }];
      if (tool === "lead_get") return { attendant: { name: "Geicy Sousa", userId: "u-gei" } };
      if (tool === "lead_update_attendant") return {};
      throw new Error("tool inesperada " + tool);
    },
  };
}

const montar = (modo: string | undefined, lista: any[], agora = AGORA) => {
  const banco = d1(modo);
  const cliente = dc(lista);
  return {
    banco, cliente,
    args: { esperaConferenciaMs: 0, env: { DB: banco as any, ROUTER_BEARER_TOKEN: "segredo" }, agora, dc: cliente, destinos: ["u-mik", "u-gei"], mapaAtendentes: MAPA },
  };
};

describe("dentroDoExpediente", () => {
  it("seg-sex 7h-18h, sábado até 14h, domingo nunca", () => {
    expect(dentroDoExpediente(new Date("2026-11-04T14:15:00Z"))).toBe(true); // qua 11:15
    expect(dentroDoExpediente(new Date("2026-11-04T09:59:00Z"))).toBe(false); // qua 06:59
    expect(dentroDoExpediente(new Date("2026-11-04T21:00:00Z"))).toBe(false); // qua 18:00 já fechou
    expect(dentroDoExpediente(new Date("2026-11-07T16:59:00Z"))).toBe(true); // sáb 13:59
    expect(dentroDoExpediente(new Date("2026-11-07T17:00:00Z"))).toBe(false); // sáb 14:00
    expect(dentroDoExpediente(new Date("2026-11-08T15:00:00Z"))).toBe(false); // domingo
  });
});

describe("varrerRepasses", () => {
  it("modo observação (padrão): decide 'repassar' e grava, mas NÃO troca o atendente", async () => {
    const t = montar(undefined, [conv("L1", "2026-11-04T14:00:00Z")]);
    const r = await varrerRepasses(t.args);
    expect(r.modo).toBe("observacao");
    expect(r.contagem["repassar:vendedor_demorou"]).toBe(1);
    expect(t.cliente.chamadas.some((c) => c.tool === "lead_update_attendant")).toBe(false);
    const dec = t.banco.inserts.find((i) => i.sql.includes("vigia_decisoes"))!;
    expect(dec.args).toContain("Mikhaell Machado");
    expect(dec.args).toContain("observacao");
  });

  it("modo ativo: troca o atendente do lead pelo escolhido", async () => {
    const t = montar("ativo", [conv("L1", "2026-11-04T14:00:00Z")]);
    await varrerRepasses(t.args);
    expect(t.cliente.chamadas.filter((c) => c.tool === "lead_update_attendant")).toEqual([
      { tool: "lead_update_attendant", args: { id: "L1", userId: "u-mik" } },
    ]);
  });

  it("modo desligado não consulta nada", async () => {
    const t = montar("desligado", [conv("L1", "2026-11-04T14:00:00Z")]);
    const r = await varrerRepasses(t.args);
    expect(r.avaliadas).toBe(0);
    expect(t.cliente.chamadas).toHaveLength(0);
  });

  it("fora do expediente não faz nada", async () => {
    const t = montar("ativo", [conv("L1", "2026-11-04T14:00:00Z")], new Date("2026-11-04T23:00:00Z")); // qua 20h
    const r = await varrerRepasses(t.args);
    expect(r.modo).toBe("fora_do_expediente");
    expect(t.cliente.chamadas).toHaveLength(0);
  });

  it("ignora grupo, conversa finalizada, conversa com o agente e mensagem com menos de 5 min", async () => {
    const t = montar("ativo", [
      conv("G", "2026-11-04T14:00:00Z", { isGroup: true }),
      conv("F", "2026-11-04T14:00:00Z", { finished: true }),
      conv("A", "2026-11-04T14:00:00Z", { attendants: [{ id: "att-nl", name: "NL Sales" }] }),
      conv("N", "2026-11-04T14:13:00Z"),
    ]);
    const r = await varrerRepasses(t.args);
    expect(r.avaliadas).toBe(0);
  });

  it("respeita o máximo por rodada, avaliando as mais recentes primeiro", async () => {
    const t = montar("observacao", [
      conv("velha", "2026-11-04T13:00:00Z"),
      conv("nova", "2026-11-04T14:03:00Z"),
    ]);
    t.banco.prepare = ((orig) => (sql: string) => {
      const p = orig(sql);
      return sql.includes("vigia_config")
        ? { bind: (...a: unknown[]) => ({ ...p.bind(...a), first: async () => (a[0] === "max_por_rodada" ? { valor: "1" } : null) }) }
        : p;
    })(t.banco.prepare.bind(t.banco)) as any;
    const r = await varrerRepasses(t.args);
    expect(r.avaliadas).toBe(1);
    expect(t.cliente.chamadas.find((c) => c.tool === "conversation_get_by_lead")!.args.leadId).toBe("nova");
  });

  it("modo ativo: repassa no máximo N por rodada e deixa o resto aguardando a vez", async () => {
    const t = montar("ativo", [conv("L1", "2026-11-04T14:00:00Z"), conv("L2", "2026-11-04T14:01:00Z"), conv("L3", "2026-11-04T14:02:00Z")]);
    const orig = t.banco.prepare.bind(t.banco);
    t.banco.prepare = ((sql: string) => {
      const p = orig(sql);
      return sql.includes("vigia_config")
        ? { bind: (...a: unknown[]) => ({ ...p.bind(...a), first: async () => (a[0] === "max_repasses_por_rodada" ? { valor: "2" } : a[0] === "modo" ? { valor: "ativo" } : null) }) }
        : p;
    }) as any;
    await varrerRepasses(t.args);
    expect(t.cliente.chamadas.filter((c) => c.tool === "lead_update_attendant")).toHaveLength(2);
    const modos = t.banco.inserts.filter((i) => i.sql.includes("vigia_decisoes") && i.args.includes("repassar")).map((i) => i.args[7]);
    expect(modos.filter((m) => m === "ativo")).toHaveLength(2);
    expect(modos.filter((m) => m === "ativo_aguardando_vez")).toHaveLength(1);
  });

  it("não repassa espera antiga demais (conversa velha)", async () => {
    const t = montar("ativo", [conv("L1", "2026-11-04T14:00:00Z")]);
    const orig = t.banco.prepare.bind(t.banco);
    t.banco.prepare = ((sql: string) => {
      const p = orig(sql);
      return sql.includes("vigia_config")
        ? { bind: (...a: unknown[]) => ({ ...p.bind(...a), first: async () => (a[0] === "max_espera_min" ? { valor: "10" } : a[0] === "modo" ? { valor: "ativo" } : null) }) }
        : p;
    }) as any;
    const r = await varrerRepasses(t.args);
    expect(r.contagem["fim:espera_antiga_demais"]).toBe(1);
    expect(t.cliente.chamadas.some((c) => c.tool === "lead_update_attendant")).toBe(false);
  });

  it("limite de repasses: grava um alerta (uma vez por lead) em vez de repetir a decisão a cada minuto", async () => {
    const t = montar("ativo", [conv("L1", "2026-11-04T14:00:00Z")]);
    const orig = t.banco.prepare.bind(t.banco);
    t.banco.prepare = ((sql: string) => {
      const p = orig(sql);
      return sql.includes("COUNT") ? { bind: (...a: unknown[]) => ({ ...p.bind(...a), first: async () => ({ n: 8, ultimo: null }) }) } : p;
    }) as any;
    await varrerRepasses(t.args);
    const alertas = t.banco.inserts.filter((i) => i.sql.includes("vigia_alertas"));
    expect(alertas).toHaveLength(1);
    expect(alertas[0].args).toContain("limite_de_repasses");
  });

  it("registra aviso ao vendedor (sem enviar): pré-aviso aos 5 min e aviso ao novo vendedor no repasse", async () => {
    const pre = montar("observacao", [conv("L1", "2026-11-04T14:10:00Z")]); // 5 min corridos: dentro do prazo, mas >= 5
    const origCall = pre.cliente.call.bind(pre.cliente);
    pre.cliente.call = async (tool: string, args: any) =>
      tool === "conversation_messages_list" ? [{ createdAt: "2026-11-04T14:10:00Z", received: true, attendantName: null, isInternal: false }] : origCall(tool, args);
    await varrerRepasses(pre.args);
    const avisosPre = pre.banco.inserts.filter((i) => i.sql.includes("vigia_avisos"));
    expect(avisosPre).toHaveLength(1);
    expect(avisosPre[0].args).toContain("pre");
    expect(avisosPre[0].args).toContain("Geicy Sousa");
    expect(pre.cliente.chamadas.some((c) => c.tool === "conversation_send_message")).toBe(false);

    const rep = montar("ativo", [conv("L2", "2026-11-04T14:00:00Z")]);
    await varrerRepasses(rep.args);
    const avisosRep = rep.banco.inserts.filter((i) => i.sql.includes("vigia_avisos") && i.args.includes("repasse"));
    expect(avisosRep).toHaveLength(1);
    expect(avisosRep[0].args).toContain("Mikhaell Machado");
    expect(rep.cliente.chamadas.some((c) => c.tool === "conversation_send_message")).toBe(false);
  });
});
