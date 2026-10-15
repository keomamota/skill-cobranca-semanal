import { describe, expect, it } from "vitest";
import { minutosUteis, analisarConversa, FRASES_ERRO_AGENTE, type MsgConversa } from "../src/kpis/conversas";

const t = (s: string) => s; // legibilidade: horários em UTC (Fortaleza = UTC-3)
const msg = (createdAt: string, who: "cli" | string, body = "x", interna = false): MsgConversa => ({
  createdAt: t(createdAt), received: who === "cli", attendantName: who === "cli" ? null : who, body, isInternal: interna,
});

describe("minutosUteis (seg-sex 7h-18h, sáb 7h-14h, Fortaleza)", () => {
  it("dentro do expediente conta os minutos corridos", () => {
    // quinta 15/10 10h00 -> 10h45 em Fortaleza = 13h00 -> 13h45 UTC
    expect(minutosUteis("2026-10-15T13:00:00Z", "2026-10-15T13:45:00Z")).toBe(45);
  });

  it("não conta noite: quinta 17h30 até sexta 7h30 = 30 + 30 min", () => {
    // quinta 15/10 17h30 FOR = 20h30Z; sexta 16/10 07h30 FOR = 10h30Z
    expect(minutosUteis("2026-10-15T20:30:00Z", "2026-10-16T10:30:00Z")).toBe(60);
  });

  it("sexta 17h30 até segunda 7h30 inclui o sábado inteiro (7h-14h): 30 + 420 + 30", () => {
    // sexta 16/10 17h30 FOR = 20h30Z; segunda 19/10 07h30 FOR = 10h30Z
    expect(minutosUteis("2026-10-16T20:30:00Z", "2026-10-19T10:30:00Z")).toBe(480);
  });

  it("domingo não conta: sábado 14h até segunda 7h30 = 30", () => {
    // sábado 17/10 14h FOR = 17h00Z; segunda 19/10 07h30 FOR = 10h30Z
    expect(minutosUteis("2026-10-17T17:00:00Z", "2026-10-19T10:30:00Z")).toBe(30);
  });

  it("sábado só até 14h: sábado 13h30 até segunda 7h15 = 30 + 15", () => {
    // sábado 17/10 13h30 FOR = 16h30Z; segunda 19/10 07h15 FOR = 10h15Z
    expect(minutosUteis("2026-10-17T16:30:00Z", "2026-10-19T10:15:00Z")).toBe(45);
  });

  it("começou fora do expediente: conta a partir da abertura", () => {
    // quinta 15/10 06h00 FOR = 09h00Z até 07h20 FOR = 10h20Z
    expect(minutosUteis("2026-10-15T09:00:00Z", "2026-10-15T10:20:00Z")).toBe(20);
  });

  it("fim antes do início ou datas inválidas dão 0, nunca negativo ou NaN", () => {
    expect(minutosUteis("2026-10-15T14:00:00Z", "2026-10-15T13:00:00Z")).toBe(0);
    expect(minutosUteis("lixo", "2026-10-15T13:00:00Z")).toBe(0);
  });
});

describe("analisarConversa", () => {
  const agora = new Date("2026-10-15T18:00:00Z"); // quinta 15h FOR

  it("conversa que o agente entregou e o vendedor assumiu em 11 min úteis", () => {
    const r = analisarConversa(
      [
        msg("2026-10-15T12:00:00Z", "cli", "Bom dia"),
        msg("2026-10-15T12:01:00Z", "NL Sales", "Olá! Como posso ajudar?"),
        msg("2026-10-15T12:05:00Z", "cli", "quanto custa a caixa"),
        msg("2026-10-15T12:06:00Z", "NL Sales", "Vou chamar um de nossos especialistas para te ajudar."),
        msg("2026-10-15T12:17:00Z", "Mikhaell Machado", "Oi, tudo bem?"),
      ],
      agora
    );
    expect(r.iniciadaPor).toBe("cliente");
    expect(r.minutosAteRespostaAgente).toBe(1);
    expect(r.passagem).toEqual({ em: "2026-10-15T12:06:00Z", humanoEm: "2026-10-15T12:17:00Z", minutosUteis: 11 });
    expect(r.errosAgente).toBe(0);
  });

  it("conta erros do agente ao cliente e ignora notas internas", () => {
    const r = analisarConversa(
      [
        msg("2026-10-15T12:00:00Z", "cli", "peça da foto"),
        msg("2026-10-15T12:01:00Z", "NL Sales", "A consulta demorou mais do que o esperado e foi cancelada. Tente novamente."),
        msg("2026-10-15T12:02:00Z", "NL Sales", "Tivemos uma instabilidade técnica temporária.", true),
      ],
      agora
    );
    expect(r.errosAgente).toBe(1);
  });

  it("passagem sem humano depois: humanoEm null e cliente esperando contado em minutos úteis", () => {
    const r = analisarConversa(
      [
        msg("2026-10-15T12:00:00Z", "cli", "orçamento"),
        msg("2026-10-15T12:01:00Z", "NL Sales", "Vou confirmar com um especialista pra você."),
        msg("2026-10-15T12:10:00Z", "cli", "ok, aguardo"),
      ],
      agora
    );
    expect(r.passagem!.humanoEm).toBeNull();
    expect(r.clienteEsperandoDesde).toBe("2026-10-15T12:10:00Z");
    expect(r.minutosEsperando).toBe(350); // 12h10Z até 18h00Z = 5h50, tudo em expediente
  });

  it("quando a última mensagem é da loja, ninguém está esperando", () => {
    const r = analisarConversa(
      [msg("2026-10-15T12:00:00Z", "cli", "oi"), msg("2026-10-15T12:01:00Z", "NL Sales", "Olá!")],
      agora
    );
    expect(r.clienteEsperandoDesde).toBeNull();
    expect(r.minutosEsperando).toBe(0);
  });

  it("conversa iniciada pela loja (prospecção) é marcada e não conta como lead de entrada", () => {
    const r = analisarConversa([msg("2026-10-15T12:00:00Z", "Mikhaell Machado", "Oi, pessoal da Arkos!")], agora);
    expect(r.iniciadaPor).toBe("loja");
  });

  it("lista vazia não quebra", () => {
    const r = analisarConversa([], agora);
    expect(r.iniciadaPor).toBeNull();
    expect(r.passagem).toBeNull();
    expect(FRASES_ERRO_AGENTE.length).toBeGreaterThan(3);
  });
});
