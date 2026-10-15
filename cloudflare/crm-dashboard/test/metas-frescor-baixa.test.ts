import { describe, expect, it } from "vitest";
import { METAS_PADRAO, mesclarMetas, statusMeta } from "../src/kpis/metas";
import { desatualizado, maisAntiga } from "../src/kpis/frescor";
import { candidatosBaixa } from "../src/kpis/candidatos-baixa";

describe("statusMeta", () => {
  const m = METAS_PADRAO.resolucao;

  it("fronteiras: 70 na meta, 69,9 atenção, 55 atenção, 54,9 abaixo", () => {
    expect(statusMeta(m, 70)).toBe("na_meta");
    expect(statusMeta(m, 69.9)).toBe("atencao");
    expect(statusMeta(m, 55)).toBe("atencao");
    expect(statusMeta(m, 54.9)).toBe("abaixo");
  });

  it("69,5% não vira 'na meta' por arredondamento", () => {
    expect(statusMeta(m, 69.5)).toBe("atencao");
  });

  it("nulo e NaN devolvem null", () => {
    expect(statusMeta(m, null)).toBeNull();
    expect(statusMeta(m, NaN)).toBeNull();
  });

  it("todas as metas padrão são provisórias", () => {
    expect(Object.values(METAS_PADRAO).every((x) => x.provisoria)).toBe(true);
  });

  it("o D1 sobrescreve só o que veio e ignora chave desconhecida", () => {
    const r = mesclarMetas([{ chave: "resolucao", naMeta: 75 }, { chave: "xyz" as never, naMeta: 1 }]);
    expect(r.resolucao.naMeta).toBe(75);
    expect(r.resolucao.atencao).toBe(55);
    expect(r.passagem30min.naMeta).toBe(80);
  });
});

describe("frescor", () => {
  const agora = new Date("2026-10-15T18:00:00Z");

  it("passou de 36 horas é desatualizado; menos que isso é atual", () => {
    expect(desatualizado("2026-10-14 03:01:03", agora)).toBe(true);
    expect(desatualizado("2026-10-15 03:01:03", agora)).toBe(false);
  });

  it("vazio, nulo e inválido NÃO são atuais", () => {
    expect(desatualizado("", agora)).toBe(true);
    expect(desatualizado(null, agora)).toBe(true);
    expect(desatualizado("lixo", agora)).toBe(true);
  });

  it("maisAntiga escolhe a mais velha e devolve null se alguma faltar", () => {
    expect(maisAntiga(["2026-10-15 03:00:00", "2026-10-11 03:00:00"])).toBe("2026-10-11 03:00:00");
    expect(maisAntiga(["2026-10-15 03:00:00", null])).toBeNull();
  });
});

describe("candidatosBaixa", () => {
  const agora = new Date("2026-10-15T18:00:00Z");
  const n = (id: string, etapa: string, last: string | null, status = "in_process") =>
    ({ id, codigo: Number(id), vendedor: "V", etapa, status, last_moved_at: last });

  it("separa parado há mais de 30 dias, inconsistente e sem data, e ignora Frio e recentes", () => {
    const r = candidatosBaixa(
      [
        n("1", "Orçamento", "2026-08-30T10:00:00.000Z"),
        n("2", "Clientes Perdidos ", "2026-10-10T10:00:00.000Z"),
        n("3", "Orçamento", "2026-10-14T10:00:00.000Z"),
        n("4", "Frio", "2026-07-01T10:00:00.000Z"),
        n("5", "Orçamento", null),
        n("6", "Negociação", "2026-08-01 10:00:00"),
      ],
      agora
    );
    expect(r.map((c) => [c.id, c.motivo])).toEqual([
      ["6", "parado_30_dias"],
      ["1", "parado_30_dias"],
      ["2", "inconsistente"],
      ["5", "sem_data"],
    ]);
  });

  it("30 dias e 1 hora conta; 29 dias e 23 horas não", () => {
    const a = candidatosBaixa([n("1", "Orçamento", "2026-09-15T17:00:00Z")], agora); // 30d 1h
    const b = candidatosBaixa([n("2", "Orçamento", "2026-09-15T19:00:00Z")], agora); // 29d 23h
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
  });

  it("data inválida vira sem_data e não some em silêncio", () => {
    expect(candidatosBaixa([n("1", "Orçamento", "lixo")], agora)[0].motivo).toBe("sem_data");
  });

  it("ganho e perdido nunca são candidatos", () => {
    expect(candidatosBaixa([n("1", "Ganho", "2026-01-01T00:00:00Z", "won")], agora)).toEqual([]);
  });
});
