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

  it("desvio contra a regra: destaca acima de 10 pp com valor exato e não destaca abaixo", () => {
    const p = participacao(rows, { agora, pesos: { m: 12, w: 12, c: 6 } });
    const m = p.find((x) => x.user_id === "m")!;
    expect(m.pctEsperado).toBeCloseTo(40, 5);
    expect(m.desvioPP).toBeCloseTo(20, 5);
    expect(m.destaque).toBe(true);
    const w = p.find((x) => x.user_id === "w")!;
    expect(w.desvioPP).toBeCloseTo(-10, 5);
    expect(w.destaque).toBe(false); // exatamente 10 pp não destaca
  });

  it("sem pesos, não há desvio", () => {
    const p = participacao(rows, { agora });
    expect(p.every((x) => x.desvioPP === null && x.destaque === false)).toBe(true);
  });

  it("lista vazia e total zero", () => {
    expect(participacao([], { agora })).toEqual([]);
    const z = participacao([{ user_id: "a", n: 0, ultimo: null }], { agora });
    expect(z[0].pct).toBe(0);
  });
});

import { pesosDaRegra, REGRA_EM_VIGOR } from "../src/kpis/regra-distribuicao";

describe("pesosDaRegra (regra publicada do roteador)", () => {
  const [w, m] = REGRA_EM_VIGOR.destinosPermitidos;

  it("peso = score ao quadrado, só para os destinos permitidos", () => {
    const p = pesosDaRegra([
      { user_id: w, score_final: 70 },
      { user_id: m, score_final: 50 },
      { user_id: "fora-da-lista", score_final: 90 },
    ]);
    expect(p[w]).toBe(4900);
    expect(p[m]).toBe(2500);
    expect(p["fora-da-lista"]).toBeUndefined();
  });

  it("score nulo, negativo ou inválido vira peso zero", () => {
    const p = pesosDaRegra([
      { user_id: w, score_final: NaN },
      { user_id: m, score_final: -5 },
    ]);
    expect(p[w]).toBe(0);
    expect(p[m]).toBe(0);
  });

  it("a participação esperada vem da regra: 70 contra 50 dá 66,2% e 33,8% entre dois", () => {
    const pesos = pesosDaRegra([{ user_id: w, score_final: 70 }, { user_id: m, score_final: 50 }]);
    const r = participacao([{ user_id: w, n: 10, ultimo: "2026-10-15 10:00:00" }, { user_id: m, n: 10, ultimo: "2026-10-15 10:00:00" }], { agora: new Date("2026-10-15T18:00:00Z"), pesos });
    expect(r.find((x) => x.user_id === w)!.pctEsperado).toBeCloseTo(66.22, 1);
    expect(r.find((x) => x.user_id === w)!.destaque).toBe(true); // 50% real contra 66,2% esperado: -16,2 pp
  });
});
