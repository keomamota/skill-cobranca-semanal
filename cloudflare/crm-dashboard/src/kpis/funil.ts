export type SituacaoNegocio = "em_atendimento" | "frio" | "ganho" | "perdido" | "inconsistente";

const ETAPAS_ATENDIMENTO = new Set(["novo lead", "qualificacao", "orcamento", "negociacao"]);

function normalizar(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Status fora de won, lost e in_process nunca é tratado como resolvido nem como atendimento.
export function classificarNegocio(n: { status: string | null; etapa: string | null }): SituacaoNegocio {
  const status = normalizar(n.status);
  if (status === "won") return "ganho";
  if (status === "lost") return "perdido";
  if (status !== "in_process") return "inconsistente";
  const etapa = normalizar(n.etapa);
  if (etapa === "frio") return "frio";
  if (ETAPAS_ATENDIMENTO.has(etapa)) return "em_atendimento";
  return "inconsistente";
}

export interface ResumoFunil {
  total: number;
  em_atendimento: number;
  frio: number;
  ganho: number;
  perdido: number;
  inconsistente: number;
}

export function funilVazio(): ResumoFunil {
  return { total: 0, em_atendimento: 0, frio: 0, ganho: 0, perdido: 0, inconsistente: 0 };
}

export function resumirFunil(
  linhas: { vendedor_id: string | null; status: string | null; etapa: string | null }[]
): Map<string, ResumoFunil> {
  const out = new Map<string, ResumoFunil>();
  for (const l of linhas) {
    const id = l.vendedor_id ?? "sem-vendedor";
    const r = out.get(id) ?? funilVazio();
    r[classificarNegocio(l)] += 1;
    r.total += 1;
    out.set(id, r);
  }
  return out;
}

export function somarFunis(rs: Iterable<ResumoFunil>): ResumoFunil {
  const t = funilVazio();
  for (const r of rs) {
    t.total += r.total;
    t.em_atendimento += r.em_atendimento;
    t.frio += r.frio;
    t.ganho += r.ganho;
    t.perdido += r.perdido;
    t.inconsistente += r.inconsistente;
  }
  return t;
}

// Só para exibir. Nunca use o valor arredondado para decidir status de meta.
export function percentual(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

// Funil ativo = tudo que não é Frio. Inconsistente conta como não resolvido.
// Devolve a taxa SEM arredondar (0 a 100) ou null quando não há funil ativo.
export function taxaResolucao(r: ResumoFunil): number | null {
  const ativos = r.total - r.frio;
  return ativos > 0 ? ((r.ganho + r.perdido) / ativos) * 100 : null;
}

export function taxaGanhoBruta(r: ResumoFunil): number | null {
  const resolvidos = r.ganho + r.perdido;
  return resolvidos > 0 ? (r.ganho / resolvidos) * 100 : null;
}
