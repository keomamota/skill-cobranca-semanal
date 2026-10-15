// Metas provisórias (R8). O D1 pode sobrescrever estes valores (tabela kpi_metas).
// Revisão com 8 semanas de dado próprio: 2026-12-04.
export type StatusMeta = "na_meta" | "atencao" | "abaixo";
export type ChaveMeta = "resolucao" | "orcamentoFechamento" | "retornoFollowup" | "passagem30min";

export interface Meta {
  chave: ChaveMeta;
  naMeta: number;
  atencao: number;
  provisoria: boolean;
  rotulo: string;
}

export const REVISAO_METAS = "2026-12-04";

export const METAS_PADRAO: Record<ChaveMeta, Meta> = {
  resolucao: { chave: "resolucao", naMeta: 70, atencao: 55, provisoria: true, rotulo: "≥ 70% em 30 dias" },
  orcamentoFechamento: { chave: "orcamentoFechamento", naMeta: 20, atencao: 15, provisoria: true, rotulo: "20 a 40%" },
  retornoFollowup: { chave: "retornoFollowup", naMeta: 25, atencao: 18, provisoria: true, rotulo: "25 a 40%" },
  passagem30min: { chave: "passagem30min", naMeta: 80, atencao: 60, provisoria: true, rotulo: "≥ 80% em até 30 min" },
};

export function mesclarMetas(linhas: Partial<Meta>[]): Record<ChaveMeta, Meta> {
  const out = { ...METAS_PADRAO };
  for (const l of linhas) {
    if (!l.chave || !(l.chave in out)) continue;
    out[l.chave] = { ...out[l.chave], ...l, chave: l.chave } as Meta;
  }
  return out;
}

// Compara o valor SEM arredondar (69,5% não é "na meta" de 70).
export function statusMeta(m: Meta, valor: number | null): StatusMeta | null {
  if (valor === null || !Number.isFinite(valor)) return null;
  if (valor >= m.naMeta) return "na_meta";
  if (valor >= m.atencao) return "atencao";
  return "abaixo";
}
