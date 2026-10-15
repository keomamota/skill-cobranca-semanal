import { horasDesde, parseUtc } from "./datas";

// Sem data, ou com data inválida, o dado NÃO é tratado como atual.
export function desatualizado(calculadoEm: string | null | undefined, agora: Date, horas = 36): boolean {
  const h = horasDesde(calculadoEm, agora);
  return h === null || h > horas;
}

// A fonte mais antiga entre várias manda no aviso; qualquer uma ausente devolve null.
export function maisAntiga(datas: (string | null | undefined)[]): string | null {
  let pior: { s: string; t: number } | null = null;
  for (const s of datas) {
    const d = parseUtc(s);
    if (!s || !d) return null;
    if (!pior || d.getTime() < pior.t) pior = { s, t: d.getTime() };
  }
  return pior ? pior.s : null;
}
