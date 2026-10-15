import { describe, expect, it } from "vitest";
import { parseUtc, diasDesde, horasDesde } from "../src/kpis/datas";

const agora = new Date("2026-10-15T18:00:00Z");

describe("parseUtc", () => {
  it("os três formatos do D1 dão o mesmo instante", () => {
    const a = parseUtc("2026-10-01 18:00:00")!.getTime();
    const b = parseUtc("2026-10-01T18:00:00")!.getTime();
    const c = parseUtc("2026-10-01T18:00:00.000Z")!.getTime();
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("vazio, nulo e lixo devolvem null", () => {
    expect(parseUtc(null)).toBeNull();
    expect(parseUtc("")).toBeNull();
    expect(parseUtc("lixo")).toBeNull();
  });
});

describe("diasDesde e horasDesde", () => {
  it("contam em dias inteiros e em horas", () => {
    expect(diasDesde("2026-10-01 18:00:00", agora)).toBe(14);
    expect(horasDesde("2026-10-14 03:01:03", agora)).toBeCloseTo(38.98, 1);
  });

  it("data inválida devolve null, nunca NaN", () => {
    expect(diasDesde("lixo", agora)).toBeNull();
    expect(horasDesde(null, agora)).toBeNull();
  });
});
