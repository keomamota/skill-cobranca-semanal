// Mesmas regras do painel (crm-dashboard/src/kpis/conversas.ts): seg-sex 7h-18h, sáb 7h-14h,
// domingo fechado, fuso de Fortaleza (UTC-3, sem horário de verão). Cópia pequena de propósito:
// o roteador e o painel são Workers separados e não compartilham código.
const MIN = 60000;
const FUSO_MS = 3 * 3600000;

export function parseUtc(s: string | null | undefined): Date | null {
  if (!s) return null;
  let t = s.trim().replace(" ", "T");
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(t)) t += "Z";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function minutosUteis(inicioIso: string, fimIso: string): number {
  const s = parseUtc(inicioIso);
  const e = parseUtc(fimIso);
  if (!s || !e || e.getTime() <= s.getTime()) return 0;
  const ls = s.getTime() - FUSO_MS;
  const le = e.getTime() - FUSO_MS;
  let dia = Math.floor(ls / 86400000) * 86400000;
  let total = 0;
  while (dia <= le) {
    const dow = new Date(dia).getUTCDay();
    const fecha = dow === 0 ? 0 : dow === 6 ? 14 * 60 : 18 * 60;
    if (fecha > 0) {
      const ini = Math.max(ls, dia + 7 * 60 * MIN);
      const fim = Math.min(le, dia + fecha * MIN);
      if (fim > ini) total += (fim - ini) / MIN;
    }
    dia += 86400000;
  }
  return Math.round(total);
}
