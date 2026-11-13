import { describe, it, expect } from "vitest";
import { decidirRepasse, type Msg } from "../src/repasse";

// 04/11/2026 é quarta-feira. Fortaleza = UTC-3: 14:00Z = 11:00 na loja.
const cliente = (iso: string): Msg => ({ createdAt: iso, received: true, attendantName: null });
const humano = (iso: string, nome = "Geicy Sousa"): Msg => ({ createdAt: iso, received: false, attendantName: nome });
const base = {
  tentativas: 0,
  excluir: [] as string[],
  candidatos: ["Mikhaell Machado", "Leonardo Oliveira", "wesley KT"],
};

describe("decidirRepasse", () => {
  it("repassa ao primeiro candidato quando o cliente espera 10 min úteis ou mais", () => {
    const r = decidirRepasse({
      ...base,
      mensagens: [cliente("2026-11-04T14:00:00Z")],
      agora: new Date("2026-11-04T14:12:00Z"),
    });
    expect(r.acao).toBe("repassar");
    expect(r.proximo).toBe("Mikhaell Machado");
    expect(r.minutosSemResposta).toBe(12);
  });

  it("não repassa antes de 10 min úteis", () => {
    const r = decidirRepasse({
      ...base,
      mensagens: [cliente("2026-11-04T14:00:00Z")],
      agora: new Date("2026-11-04T14:09:00Z"),
    });
    expect(r.acao).toBe("fim");
    expect(r.motivo).toBe("dentro_do_prazo");
    expect(r.proximo).toBeNull();
  });

  it("não repassa se o vendedor já respondeu depois da mensagem do cliente", () => {
    const r = decidirRepasse({
      ...base,
      mensagens: [cliente("2026-11-04T14:00:00Z"), humano("2026-11-04T14:05:00Z")],
      agora: new Date("2026-11-04T15:30:00Z"),
    });
    expect(r.acao).toBe("fim");
    expect(r.motivo).toBe("cliente_nao_esta_esperando");
  });

  it("conta a espera desde a primeira mensagem sem resposta, não desde a primeira da conversa", () => {
    const r = decidirRepasse({
      ...base,
      mensagens: [
        cliente("2026-11-03T14:00:00Z"),
        humano("2026-11-03T14:02:00Z"),
        cliente("2026-11-04T14:00:00Z"),
        cliente("2026-11-04T14:03:00Z"),
      ],
      agora: new Date("2026-11-04T14:11:00Z"),
    });
    expect(r.acao).toBe("repassar");
    expect(r.minutosSemResposta).toBe(11);
  });

  it("só conta o horário da loja: mensagem às 17:57 e agora 18:05 são 3 min úteis", () => {
    const r = decidirRepasse({
      ...base,
      mensagens: [cliente("2026-11-04T20:57:00Z")],
      agora: new Date("2026-11-04T21:05:00Z"),
    });
    expect(r.acao).toBe("fim");
    expect(r.minutosSemResposta).toBe(3);
  });

  it("no dia seguinte, depois da abertura, completa os 10 min úteis e repassa", () => {
    const r = decidirRepasse({
      ...base,
      mensagens: [cliente("2026-11-04T20:55:00Z")],
      agora: new Date("2026-11-05T10:06:00Z"),
    });
    expect(r.acao).toBe("repassar");
    expect(r.minutosSemResposta).toBe(11);
  });

  it("depois de 3 repasses sem resposta, marca sem atendimento em vez de repassar de novo", () => {
    const r = decidirRepasse({
      ...base,
      tentativas: 8,
      mensagens: [cliente("2026-11-04T14:00:00Z")],
      agora: new Date("2026-11-04T14:12:00Z"),
    });
    expect(r.acao).toBe("sem_atendimento");
    expect(r.motivo).toBe("limite_de_repasses");
    expect(r.proximo).toBeNull();
  });

  it("pula quem está excluído (já tentou, saiu da equipe, ausente)", () => {
    const r = decidirRepasse({
      ...base,
      excluir: ["Mikhaell Machado"],
      mensagens: [cliente("2026-11-04T14:00:00Z")],
      agora: new Date("2026-11-04T14:12:00Z"),
    });
    expect(r.proximo).toBe("Leonardo Oliveira");
  });

  it("sem candidato disponível, marca sem atendimento", () => {
    const r = decidirRepasse({
      ...base,
      excluir: ["Mikhaell Machado", "Leonardo Oliveira", "wesley KT"],
      mensagens: [cliente("2026-11-04T14:00:00Z")],
      agora: new Date("2026-11-04T14:12:00Z"),
    });
    expect(r.acao).toBe("sem_atendimento");
    expect(r.motivo).toBe("sem_candidato");
  });

  it("não mexe em conversa finalizada", () => {
    const r = decidirRepasse({
      ...base,
      finalizada: true,
      mensagens: [cliente("2026-11-04T14:00:00Z")],
      agora: new Date("2026-11-04T14:30:00Z"),
    });
    expect(r.acao).toBe("fim");
    expect(r.motivo).toBe("conversa_finalizada");
  });

  it("não mexe em conversa que ainda está com o agente", () => {
    const r = decidirRepasse({
      ...base,
      donos: ["NL Sales"],
      mensagens: [cliente("2026-11-04T14:00:00Z")],
      agora: new Date("2026-11-04T14:30:00Z"),
    });
    expect(r.acao).toBe("fim");
    expect(r.motivo).toBe("conversa_com_o_agente");
  });

  it("lead existente: vendedor respondeu há 60 dias, cliente voltou e espera 15 min, dono que saiu da equipe: repassa a outro", () => {
    const r = decidirRepasse({
      ...base,
      donos: ["Kayllane Soares"],
      excluir: ["Kayllane Soares"],
      mensagens: [
        cliente("2026-09-05T14:00:00Z"),
        humano("2026-09-05T14:04:00Z", "Kayllane Soares"),
        cliente("2026-11-04T14:00:00Z"),
      ],
      agora: new Date("2026-11-04T14:15:00Z"),
    });
    expect(r.acao).toBe("repassar");
    expect(r.proximo).toBe("Mikhaell Machado");
    expect(r.minutosSemResposta).toBe(15);
  });

  it("mensagem automática (sem atendente) depois do cliente não conta como resposta", () => {
    const automatica: Msg = { createdAt: "2026-11-04T14:00:30Z", received: false, attendantName: null };
    const r = decidirRepasse({
      ...base,
      mensagens: [cliente("2026-11-04T14:00:00Z"), automatica],
      agora: new Date("2026-11-04T14:12:00Z"),
    });
    expect(r.acao).toBe("repassar");
    expect(r.minutosSemResposta).toBe(12);
  });

  it("fala do agente (NL Sales) não é resposta de vendedor: o cliente segue esperando o especialista (relógio conta da passagem do agente)", () => {
    const r = decidirRepasse({
      ...base,
      donos: ["Mikhaell Machado"],
      mensagens: [cliente("2026-11-04T14:00:00Z"), humano("2026-11-04T14:01:00Z", "NL Sales")],
      agora: new Date("2026-11-04T14:30:00Z"),
    });
    expect(r.acao).toBe("repassar");
    expect(r.minutosSemResposta).toBe(29);
  });

  it("agente avisou, o vendedor respondeu: não repassa", () => {
    const r = decidirRepasse({
      ...base,
      donos: ["Mikhaell Machado"],
      mensagens: [cliente("2026-11-04T14:00:00Z"), humano("2026-11-04T14:01:00Z", "NL Sales"), humano("2026-11-04T14:05:00Z", "Mikhaell Machado")],
      agora: new Date("2026-11-04T14:30:00Z"),
    });
    expect(r.acao).toBe("fim");
    expect(r.motivo).toBe("cliente_nao_esta_esperando");
  });

  it("depois de um repasse, o relógio de 10 min recomeça para o novo vendedor", () => {
    const entrada = {
      ...base,
      tentativas: 1,
      mensagens: [cliente("2026-11-04T14:00:00Z")],
      ultimoRepasseEm: "2026-11-04 14:12:00",
    };
    const cedo = decidirRepasse({ ...entrada, agora: new Date("2026-11-04T14:15:00Z") });
    expect(cedo.acao).toBe("fim");
    expect(cedo.motivo).toBe("dentro_do_prazo");
    expect(cedo.minutosSemResposta).toBe(3);
    const tarde = decidirRepasse({ ...entrada, agora: new Date("2026-11-04T14:23:00Z") });
    expect(tarde.acao).toBe("repassar");
    expect(tarde.minutosSemResposta).toBe(11);
  });

  describe("relógio depois do NL Sales", () => {
    const agente = (iso: string, body = ""): Msg => ({ createdAt: iso, received: false, attendantName: "NL Sales", body });
    it("a espera conta a partir da passagem do agente, não de mensagens que o agente já respondeu", () => {
      // cliente falou 11:00 (respondido pelo agente), agente passou 11:55, cliente mandou 11:56; agora 12:00
      const r = decidirRepasse({
        ...base,
        mensagens: [cliente("2026-11-04T14:00:00Z"), agente("2026-11-04T14:55:00Z", "um especialista já assume"), cliente("2026-11-04T14:56:00Z")],
        agora: new Date("2026-11-04T15:00:00Z"),
      });
      expect(r.acao).toBe("fim");
      expect(r.motivo).toBe("dentro_do_prazo");
      expect(r.minutosSemResposta).toBe(4);
    });
    it("sem mensagem nova do cliente depois do agente, o relógio começa na fala do agente", () => {
      const r = decidirRepasse({
        ...base,
        mensagens: [cliente("2026-11-04T14:00:00Z"), agente("2026-11-04T14:50:00Z", "um especialista já assume")],
        agora: new Date("2026-11-04T15:02:00Z"),
      });
      expect(r.acao).toBe("repassar");
      expect(r.minutosSemResposta).toBe(12);
    });
    it("não repassa quando o agente encaminhou um assunto de pedido/entrega já feito (resolve o vendedor da compra)", () => {
      const r = decidirRepasse({
        ...base,
        mensagens: [
          cliente("2026-11-04T14:00:00Z"),
          agente("2026-11-04T14:01:00Z", "Para consultar sua entrega, por favor, me informe: seu CPF, o dia da compra e o nome do vendedor que te atendeu."),
          cliente("2026-11-04T14:05:00Z"),
          agente("2026-11-04T14:06:00Z", "Perfeito, já estou localizando seu pedido com a nossa equipe de logística, um momento!"),
          cliente("2026-11-04T14:07:00Z"),
        ],
        agora: new Date("2026-11-04T15:30:00Z"),
      });
      expect(r.acao).toBe("fim");
      expect(r.motivo).toBe("pedido_ou_entrega_existente");
    });
  });
});
