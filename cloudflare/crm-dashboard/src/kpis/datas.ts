// Datas do D1 vêm em três formatos: "AAAA-MM-DD HH:MM:SS" (datetime do SQLite, UTC),
// ISO com "T" e "Z" (API do CRM) e ISO com "T" sem fuso. Tudo é tratado como UTC.
export function parseUtc(s: string | null | undefined): Date | null {
  if (!s) return null;
  let t = s.trim().replace(" ", "T");
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(t)) t += "Z";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function msDesde(s: string | null | undefined, agora: Date): number | null {
  const d = parseUtc(s);
  return d ? agora.getTime() - d.getTime() : null;
}

export function horasDesde(s: string | null | undefined, agora: Date): number | null {
  const ms = msDesde(s, agora);
  return ms === null ? null : ms / 3600000;
}

export function diasDesde(s: string | null | undefined, agora: Date): number | null {
  const ms = msDesde(s, agora);
  return ms === null ? null : Math.floor(ms / 86400000);
}
