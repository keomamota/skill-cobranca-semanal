import { diasDesde } from "./datas";

export interface LeadsRecebidos {
  user_id: string;
  n: number;
  ultimo: string | null;
}

export interface Participacao {
  user_id: string;
  n: number;
  pct: number;
  ultimo: string | null;
  dias: number | null;
  foraDaDistribuicao: boolean;
  peso: number | null;
  pctEsperado: number | null;
  desvioPP: number | null;
  destaque: boolean;
}

export const DIAS_FORA_DA_DISTRIBUICAO = 14;
export const LIMITE_DESVIO_PP = 10;

export function participacao(
  rows: LeadsRecebidos[],
  opts: {
    agora: Date;
    pesos?: Record<string, number>; // peso relativo de cada vendedor segundo a regra em vigor
    vendedoresAtivos?: string[];
    ultimoPorVendedor?: Map<string, string>;
  }
): Participacao[] {
  const porId = new Map(rows.map((r) => [r.user_id, r]));
  const ids = new Set<string>([...porId.keys(), ...(opts.vendedoresAtivos ?? [])]);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const pesos = opts.pesos ?? {};
  const somaPesos = [...ids].reduce((s, id) => s + (pesos[id] ?? 0), 0);

  return [...ids]
    .map((id) => {
      const r = porId.get(id);
      const n = r?.n ?? 0;
      const ultimo = opts.ultimoPorVendedor?.get(id) ?? r?.ultimo ?? null;
      const dias = diasDesde(ultimo, opts.agora);
      const pct = total > 0 ? (n / total) * 100 : 0;
      const peso = pesos[id];
      const pctEsperado = peso !== undefined && somaPesos > 0 ? (peso / somaPesos) * 100 : null;
      const desvioPP = pctEsperado === null ? null : pct - pctEsperado;
      return {
        user_id: id,
        n,
        pct,
        ultimo,
        dias,
        foraDaDistribuicao: dias === null || dias > DIAS_FORA_DA_DISTRIBUICAO,
        peso: peso ?? null,
        pctEsperado,
        desvioPP,
        destaque: desvioPP !== null && Math.abs(desvioPP) > LIMITE_DESVIO_PP,
      } satisfies Participacao;
    })
    .sort((a, b) => b.n - a.n);
}
