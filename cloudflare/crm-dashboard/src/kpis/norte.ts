import { parseUtc } from "./datas";

export interface CoorteSemana {
  inicio: string; // AAAA-MM-DD (segunda-feira da semana)
  leads: number;
  ganhos: number;
}

export interface CoorteExibida {
  inicio: string;
  leads: number;
  ganhos: number;
  por100: number | null; // sem arredondar
  parcial: boolean;
}

export const MIN_LEADS_COORTE = 30;
const DIAS_MATURACAO = 7 + 30; // a semana inteira mais os 30 dias para ganhar

export function exibirCoortes(coortes: CoorteSemana[], hoje: Date): CoorteExibida[] {
  return [...coortes]
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((c) => {
      const ini = parseUtc(`${c.inicio}T00:00:00Z`);
      const fim = ini ? ini.getTime() + DIAS_MATURACAO * 86400000 : Infinity;
      return {
        inicio: c.inicio,
        leads: c.leads,
        ganhos: c.ganhos,
        por100: c.leads >= MIN_LEADS_COORTE ? (c.ganhos / c.leads) * 100 : null,
        parcial: fim > hoje.getTime(), // data inválida nunca é "fechada"
      };
    });
}

export function coorteFechadaMaisRecente(c: CoorteExibida[]): CoorteExibida | null {
  const fechadas = c.filter((x) => !x.parcial && x.por100 !== null);
  if (!fechadas.length) return null;
  return fechadas.reduce((a, b) => (b.inicio > a.inicio ? b : a));
}

// A coorte anterior à informada, entre as fechadas com taxa, e só se for a semana imediatamente anterior.
export function coorteSemanaAnterior(c: CoorteExibida[], atual: CoorteExibida): CoorteExibida | null {
  const ini = parseUtc(`${atual.inicio}T00:00:00Z`);
  if (!ini) return null;
  const alvo = new Date(ini.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const r = c.find((x) => x.inicio === alvo && !x.parcial && x.por100 !== null);
  return r ?? null;
}
