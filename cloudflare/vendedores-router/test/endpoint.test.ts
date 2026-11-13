import { describe, it, expect } from "vitest";
import { tratarConversaParada, type Dependencias } from "../src/endpoint";
import type { Msg } from "../src/repasse";

const cliente = (iso: string): Msg => ({ createdAt: iso, received: true, attendantName: null });
const humano = (iso: string, nome: string): Msg => ({ createdAt: iso, received: false, attendantName: nome });

function deps(over: Partial<Dependencias> = {}): Dependencias {
  return {
    token: "segredo",
    agora: new Date("2026-11-04T14:15:00Z"),
    candidatos: async () => ["Mikhaell Machado", "Leonardo Oliveira", "wesley KT"],
    tentativas: async () => 0,
    dc: {
      conversaPorLead: async () => ({ id: "c1", finalizada: false, donos: ["Geicy Sousa"] }),
      mensagens: async () => [cliente("2026-11-04T14:00:00Z")],
      donoDoLead: async () => "Geicy Sousa",
    },
    ...over,
  };
}

const pedido = (qs = "?leadId=L1", auth: string | null = "Bearer segredo") =>
  new Request(`https://x/conversa-parada${qs}`, { headers: auth ? { Authorization: auth } : {} });

describe("tratarConversaParada", () => {
  it("responde 401 sem o token certo", async () => {
    expect((await tratarConversaParada(pedido("?leadId=L1", null), deps())).status).toBe(401);
    expect((await tratarConversaParada(pedido("?leadId=L1", "Bearer errado"), deps())).status).toBe(401);
  });

  it("responde 400 sem leadId", async () => {
    const r = await tratarConversaParada(pedido(""), deps());
    expect(r.status).toBe(400);
  });

  it("lead sem conversa: não faz nada", async () => {
    const r = await tratarConversaParada(pedido(), deps({ dc: { ...deps().dc, conversaPorLead: async () => null } }));
    const j = await r.json();
    expect(j).toMatchObject({ acao: "fim", motivo: "sem_conversa" });
  });

  it("cliente esperando há 15 min: manda repassar e não sugere o dono atual", async () => {
    const r = await tratarConversaParada(pedido(), deps({ candidatos: async () => ["Geicy Sousa", "Mikhaell Machado"] }));
    const j = await r.json();
    expect(j).toMatchObject({ acao: "repassar", proximo: "Mikhaell Machado", minutosSemResposta: 15 });
  });

  it("não sugere quem já teve a conversa nem o último humano que respondeu", async () => {
    const r = await tratarConversaParada(
      pedido(),
      deps({
        dc: {
          conversaPorLead: async () => ({ id: "c1", finalizada: false, donos: ["Geicy Sousa"] }),
          mensagens: async () => [humano("2026-09-01T14:00:00Z", "Leonardo Oliveira"), cliente("2026-11-04T14:00:00Z")],
          donoDoLead: async () => "Mikhaell Machado",
        },
      }),
    );
    const j = await r.json();
    expect(j.proximo).toBe("wesley KT");
  });

  it("lead existente com dono que saiu da equipe: repassa mesmo assim", async () => {
    const r = await tratarConversaParada(
      pedido(),
      deps({
        dc: {
          conversaPorLead: async () => ({ id: "c1", finalizada: false, donos: ["Kayllane Soares"] }),
          mensagens: async () => [humano("2026-06-16T12:18:00Z", "Kayllane Soares"), cliente("2026-11-04T14:00:00Z")],
          donoDoLead: async () => "Kayllane Soares",
        },
      }),
    );
    const j = await r.json();
    expect(j).toMatchObject({ acao: "repassar", proximo: "Mikhaell Machado" });
  });

  it("conversa finalizada: não repassa", async () => {
    const r = await tratarConversaParada(
      pedido(),
      deps({ dc: { ...deps().dc, conversaPorLead: async () => ({ id: "c1", finalizada: true, donos: [] }) } }),
    );
    expect(await r.json()).toMatchObject({ acao: "fim", motivo: "conversa_finalizada" });
  });

  it("depois de 8 tentativas, devolve sem_atendimento", async () => {
    const r = await tratarConversaParada(pedido(), deps({ tentativas: async () => 8 }));
    expect(await r.json()).toMatchObject({ acao: "sem_atendimento", motivo: "limite_de_repasses" });
  });

  it("falha do Data Crazy: responde sem repassar, com o motivo", async () => {
    const r = await tratarConversaParada(
      pedido(),
      deps({ dc: { ...deps().dc, mensagens: async () => { throw new Error("HTTP 500"); } } }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ acao: "fim", motivo: "erro_ao_verificar" });
  });
});
