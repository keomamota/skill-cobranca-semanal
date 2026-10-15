import { describe, expect, it } from "vitest";
import { montarRanking, type ScoreVendedor } from "../src/kpis/ranking";
import { funilVazio } from "../src/kpis/funil";

const base = {
  taxa_resolucao: 0.3, taxa_ganho_suavizada: 0.3, mediana_minutos_resposta: 1,
  score_velocidade: 100, score_resolucao: 50, score_ganho: 50, calculado_em: "2026-10-15 03:01:03",
};
const s = (o: Partial<ScoreVendedor> & Pick<ScoreVendedor, "user_id" | "resolvidos" | "score_final">): ScoreVendedor => ({
  ...base, nome: o.user_id.toUpperCase(), ...o,
});

describe("montarRanking", () => {
  const scores = [
    s({ user_id: "a", resolvidos: 109, score_final: 72 }),
    s({ user_id: "b", resolvidos: 7, score_final: 80 }), // parcial, score alto
    s({ user_id: "c", resolvidos: 44, score_final: 33.6 }),
    s({ user_id: "d", resolvidos: 4, score_final: 10 }), // parcial
  ];

  it("confiança plena ordena por score; parcial vai depois em ordem alfabética, mesmo com score maior", () => {
    const r = montarRanking(scores, new Map(), [], new Map());
    expect(r.map((x) => x.user_id)).toEqual(["a", "c", "b", "d"]);
  });

  it("nota de confiança parcial e plena sem nota", () => {
    const r = montarRanking(scores, new Map(), [], new Map());
    expect(r.find((x) => x.user_id === "b")!.nota).toBe("confiança parcial: 7 resolvidos");
    expect(r.find((x) => x.user_id === "a")!.nota).toBeNull();
  });

  it("10 resolvidos exatos já é confiança plena", () => {
    const r = montarRanking([s({ user_id: "x", resolvidos: 10, score_final: 5 })], new Map(), [], new Map());
    expect(r[0].confianca).toBe("plena");
  });

  it("quem recebeu lead e não tem score aparece, sem score, no fim", () => {
    const leads = [{ user_id: "z", n: 5, pct: 50, ultimo: null, dias: null, foraDaDistribuicao: true, cotaDia: null, pctCota: null, desvioPP: null, destaque: false }];
    const r = montarRanking(scores, new Map(), leads, new Map([["z", "Zélia"]]));
    const z = r[r.length - 1];
    expect(z.user_id).toBe("z");
    expect(z.confianca).toBe("sem_score");
    expect(z.nome).toBe("Zélia");
    expect(z.score).toBeNull();
  });

  it("nome nulo e score_final inválido não quebram e não bagunçam a ordem", () => {
    const r = montarRanking(
      [s({ user_id: "n", resolvidos: 50, score_final: NaN, nome: null }), s({ user_id: "o", resolvidos: 50, score_final: 20 })],
      new Map(),
      [],
      new Map()
    );
    expect(r.map((x) => x.user_id)).toEqual(["o", "n"]);
    expect(r[1].nome).toBe("Vendedor não identificado");
  });

  it("funil vazio quando o vendedor não tem negócios; lista vazia devolve vazio", () => {
    expect(montarRanking(scores, new Map(), [], new Map())[0].funil).toEqual(funilVazio());
    expect(montarRanking([], new Map(), [], new Map())).toEqual([]);
  });
});
