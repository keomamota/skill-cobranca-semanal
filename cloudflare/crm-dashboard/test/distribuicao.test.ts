import { describe, expect, it } from "vitest";
import { participacao } from "../src/kpis/distribuicao";

const agora = new Date("2026-10-15T18:00:00Z");
const rows = [
  { user_id: "m", n: 60, ultimo: "2026-10-15 17:31:50" },
  { user_id: "w", n: 30, ultimo: "2026-10-15 17:13:41" },
  { user_id: "c", n: 10, ultimo: "2026-09-12 18:31:41" },
];

describe("participacao", () => {
  it("percentual sobre o total do período e soma 100", () => {
    const p = participacao(rows, { agora });
    expect(p.find((x) => x.user_id === "m")!.pct).toBeCloseTo(60, 5);
    expect(p.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 5);
  });

  it("fora da distribuição passa de 14 dias; 14 exatos ainda está dentro", () => {
    const p = participacao(
      [...rows, { user_id: "k", n: 1, ultimo: "2026-10-01 18:00:00" }, { user_id: "j", n: 1, ultimo: "2026-09-30 17:00:00" }],
      { agora }
    );
    expect(p.find((x) => x.user_id === "c")!.foraDaDistribuicao).toBe(true);
    expect(p.find((x) => x.user_id === "k")!.foraDaDistribuicao).toBe(false);
    expect(p.find((x) => x.user_id === "j")!.foraDaDistribuicao).toBe(true);
  });

  it("vendedor ativo sem lead na janela aparece com 0 e usa o último lead de todos os tempos", () => {
    const p = participacao(rows, {
      agora,
      vendedoresAtivos: ["m", "w", "c", "z"],
      ultimoPorVendedor: new Map([["z", "2026-10-14 10:00:00"]]),
    });
    const z = p.find((x) => x.user_id === "z")!;
    expect(z.n).toBe(0);
    expect(z.pct).toBe(0);
    expect(z.foraDaDistribuicao).toBe(false);
  });

  it("sem nenhuma data o vendedor é marcado fora da distribuição", () => {
    const p = participacao([{ user_id: "x", n: 3, ultimo: null }], { agora });
    expect(p[0].foraDaDistribuicao).toBe(true);
    expect(p[0].dias).toBeNull();
  });

  it("data inválida nunca vira dado fresco", () => {
    const p = participacao([{ user_id: "x", n: 3, ultimo: "lixo" }], { agora });
    expect(p[0].foraDaDistribuicao).toBe(true);
  });

  it("desvio contra a cota: destaca acima de 10 pp com valor exato e não destaca abaixo", () => {
    const p = participacao(rows, { agora, cotaDia: { m: 12, w: 12, c: 6 } });
    const m = p.find((x) => x.user_id === "m")!;
    expect(m.pctCota).toBeCloseTo(40, 5);
    expect(m.desvioPP).toBeCloseTo(20, 5);
    expect(m.destaque).toBe(true);
    const w = p.find((x) => x.user_id === "w")!;
    expect(w.desvioPP).toBeCloseTo(-10, 5);
    expect(w.destaque).toBe(false); // exatamente 10 pp não destaca
  });

  it("sem cota configurada, não há desvio", () => {
    const p = participacao(rows, { agora });
    expect(p.every((x) => x.desvioPP === null && x.destaque === false)).toBe(true);
  });

  it("lista vazia e total zero", () => {
    expect(participacao([], { agora })).toEqual([]);
    const z = participacao([{ user_id: "a", n: 0, ultimo: null }], { agora });
    expect(z[0].pct).toBe(0);
  });
});
