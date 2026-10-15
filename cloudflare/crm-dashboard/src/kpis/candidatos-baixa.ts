import { classificarNegocio } from "./funil";
import { parseUtc } from "./datas";

export interface NegocioAberto {
  id: string;
  codigo: number | null;
  vendedor: string;
  etapa: string | null;
  status: string;
  last_moved_at: string | null;
}

export interface CandidatoBaixa {
  id: string;
  codigo: number | null;
  vendedor: string;
  etapa: string | null;
  motivo: "parado_30_dias" | "inconsistente" | "sem_data";
  diasParado: number | null;
}

const LIMITE_HORAS = 30 * 24;

// Lista só leitura (R9.1). Frio fica de fora; quem dá baixa é a Keoma, fora do painel.
export function candidatosBaixa(linhas: NegocioAberto[], agora: Date): CandidatoBaixa[] {
  const out: CandidatoBaixa[] = [];
  for (const l of linhas) {
    const situacao = classificarNegocio(l);
    if (situacao !== "inconsistente" && situacao !== "em_atendimento") continue;
    const d = parseUtc(l.last_moved_at);
    const horas = d ? (agora.getTime() - d.getTime()) / 3600000 : null;
    const dias = horas === null ? null : Math.floor(horas / 24);
    const base = { id: l.id, codigo: l.codigo, vendedor: l.vendedor, etapa: l.etapa, diasParado: dias };
    if (situacao === "inconsistente") out.push({ ...base, motivo: "inconsistente" });
    else if (horas === null) out.push({ ...base, motivo: "sem_data" });
    else if (horas > LIMITE_HORAS) out.push({ ...base, motivo: "parado_30_dias" });
  }
  return out.sort((a, b) => (b.diasParado ?? -1) - (a.diasParado ?? -1));
}
