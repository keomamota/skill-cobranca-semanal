// P0-1 da auditoria: desde 17/09 o log de roteamento grava lead_id = 'agente' nas
// transferências do agente. Enquanto a maioria das linhas não casar com um negócio, o
// KPI-norte NÃO é publicado. Os limites são ajustáveis aqui.
export interface ContagemLeads {
  total: number; // linhas de roteamento reais da janela
  validas: number; // com lead_id diferente de 'agente' e de 'teste-%'
  casam: number; // das válidas, as que têm negócio em negocios
}

export interface QualidadeLeads extends ContagemLeads {
  pctValidas: number | null;
  pctCasam: number | null;
  disponivel: boolean;
  motivo: string | null;
}

export const MINIMO_LINHAS = 30;
export const MINIMO_VALIDAS_PCT = 80;
export const MINIMO_CASAM_PCT = 80;

export function avaliarQualidadeLeads(c: ContagemLeads): QualidadeLeads {
  const pctValidas = c.total > 0 ? (c.validas / c.total) * 100 : null;
  const pctCasam = c.validas > 0 ? (c.casam / c.validas) * 100 : null;
  let motivo: string | null = null;
  if (c.total < MINIMO_LINHAS) {
    motivo = `poucos leads no período (${c.total})`;
  } else if (pctValidas === null || pctValidas < MINIMO_VALIDAS_PCT) {
    motivo = `${Math.round(100 - (pctValidas ?? 0))}% das linhas de roteamento não trazem o id real do lead`;
  } else if (pctCasam === null || pctCasam < MINIMO_CASAM_PCT) {
    motivo = `${Math.round(100 - (pctCasam ?? 0))}% dos leads roteados não têm negócio no CRM`;
  }
  return { ...c, pctValidas, pctCasam, disponivel: motivo === null, motivo };
}
