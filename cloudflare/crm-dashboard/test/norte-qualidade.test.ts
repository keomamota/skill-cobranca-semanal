import { describe, expect, it } from "vitest";
import { exibirCoortes, coorteFechadaMaisRecente, coorteSemanaAnterior } from "../src/kpis/norte";
import { avaliarQualidadeLeads } from "../src/kpis/qualidade";

const hoje = new Date("2026-10-15T12:00:00Z");

describe("exibirCoortes", () => {
  const c = [
    { inicio: "2026-09-21", leads: 100, ganhos: 9 },
    { inicio: "2026-08-24", leads: 200, ganhos: 28 },
    { inicio: "2026-08-31", leads: 29, ganhos: 5 },
  ];

  it("ordena por data, não arredonda e marca parcial quando a semana mais 30 dias passa de hoje", () => {
    const r = exibirCoortes(c, hoje);
    expect(r.map((x) => x.inicio)).toEqual(["2026-08-24", "2026-08-31", "2026-09-21"]);
    expect(r[0].por100).toBeCloseTo(14, 5);
    expect(r[0].parcial).toBe(false);
    expect(r[2].parcial).toBe(true);
  });

  it("menos de 30 leads não dá taxa; 30 leads dá", () => {
    const r = exibirCoortes([...c, { inicio: "2026-08-17", leads: 30, ganhos: 3 }], hoje);
    expect(r.find((x) => x.inicio === "2026-08-31")!.por100).toBeNull();
    expect(r.find((x) => x.inicio === "2026-08-17")!.por100).toBeCloseTo(10, 5);
  });

  it("início inválido é tratado como parcial", () => {
    expect(exibirCoortes([{ inicio: "lixo", leads: 100, ganhos: 5 }], hoje)[0].parcial).toBe(true);
  });

  it("fecha exatamente 37 dias depois do início da semana", () => {
    const r = exibirCoortes([{ inicio: "2026-09-08", leads: 100, ganhos: 5 }], new Date("2026-10-15T00:00:00Z"));
    expect(r[0].parcial).toBe(false); // 08/09 + 37 dias = 15/10 00:00
    const r2 = exibirCoortes([{ inicio: "2026-09-08", leads: 100, ganhos: 5 }], new Date("2026-10-14T23:59:59Z"));
    expect(r2[0].parcial).toBe(true);
  });
});

describe("coorte fechada mais recente e semana anterior", () => {
  const r = exibirCoortes(
    [
      { inicio: "2026-08-10", leads: 100, ganhos: 8 },
      { inicio: "2026-08-24", leads: 200, ganhos: 28 },
      { inicio: "2026-08-31", leads: 100, ganhos: 12 },
      { inicio: "2026-09-21", leads: 100, ganhos: 9 },
    ],
    hoje
  );

  it("pega a mais recente por data entre as fechadas com taxa, qualquer que seja a ordem da lista", () => {
    expect(coorteFechadaMaisRecente([...r].reverse())!.inicio).toBe("2026-08-31");
    expect(coorteFechadaMaisRecente([])).toBeNull();
  });

  it("semana anterior só existe se for a semana imediatamente anterior", () => {
    const atual = coorteFechadaMaisRecente(r)!;
    expect(coorteSemanaAnterior(r, atual)!.inicio).toBe("2026-08-24");
    expect(coorteSemanaAnterior(r, r[1])).toBeNull(); // 17/08 não existe
  });
});

describe("avaliarQualidadeLeads", () => {
  it("disponível quando a maioria das linhas tem id real e negócio", () => {
    const q = avaliarQualidadeLeads({ total: 100, validas: 95, casam: 90 });
    expect(q.disponivel).toBe(true);
    expect(q.motivo).toBeNull();
  });

  it("o caso real de 15/10: 485 de 1.103 linhas são 'agente'", () => {
    const q = avaliarQualidadeLeads({ total: 1103, validas: 618, casam: 511 });
    expect(q.disponivel).toBe(false);
    expect(q.motivo).toContain("não trazem o id real do lead");
  });

  it("ids reais, mas sem negócio", () => {
    const q = avaliarQualidadeLeads({ total: 100, validas: 100, casam: 68 });
    expect(q.disponivel).toBe(false);
    expect(q.motivo).toContain("não têm negócio no CRM");
  });

  it("poucos dados e total zero não dividem por zero", () => {
    expect(avaliarQualidadeLeads({ total: 10, validas: 10, casam: 10 }).disponivel).toBe(false);
    const z = avaliarQualidadeLeads({ total: 0, validas: 0, casam: 0 });
    expect(z.pctValidas).toBeNull();
    expect(z.disponivel).toBe(false);
  });
});
