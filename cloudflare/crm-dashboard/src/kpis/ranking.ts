import type { ResumoFunil } from "./funil";
import { funilVazio } from "./funil";
import type { Participacao } from "./distribuicao";

export interface ScoreVendedor {
  user_id: string;
  nome: string | null;
  resolvidos: number;
  taxa_resolucao: number;
  taxa_ganho_suavizada: number;
  mediana_minutos_resposta: number | null;
  score_velocidade: number;
  score_resolucao: number;
  score_ganho: number;
  score_final: number;
  calculado_em: string;
}

export type Confianca = "plena" | "parcial" | "sem_score";

export interface LinhaRanking {
  user_id: string;
  nome: string;
  score: ScoreVendedor | null;
  confianca: Confianca;
  nota: string | null;
  funil: ResumoFunil;
  leads: Participacao | null;
}

export const MIN_RESOLVIDOS_CONFIANCA = 10;
const SEM_NOME = "Vendedor não identificado";

function numero(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

// R12.8: quem tem confiança parcial NÃO entra na ordenação por score. Aparece depois,
// em ordem alfabética, para ninguém ser lido como melhor ou pior com amostra pequena.
export function montarRanking(
  scores: ScoreVendedor[],
  funis: Map<string, ResumoFunil>,
  leads: Participacao[],
  nomes: Map<string, string>
): LinhaRanking[] {
  const leadsPorId = new Map(leads.map((l) => [l.user_id, l]));
  const porScore = new Map(scores.map((s) => [s.user_id, s]));
  const ids = new Set<string>([...porScore.keys(), ...leadsPorId.keys()]);

  const linhas: LinhaRanking[] = [...ids].map((id) => {
    const s = porScore.get(id) ?? null;
    const nome = s?.nome ?? nomes.get(id) ?? SEM_NOME;
    let confianca: Confianca = "sem_score";
    let nota: string | null = "sem score calculado ainda";
    if (s) {
      const parcial = s.resolvidos < MIN_RESOLVIDOS_CONFIANCA;
      confianca = parcial ? "parcial" : "plena";
      nota = parcial ? `confiança parcial: ${s.resolvidos} resolvidos` : null;
    }
    return { user_id: id, nome, score: s, confianca, nota, funil: funis.get(id) ?? funilVazio(), leads: leadsPorId.get(id) ?? null };
  });

  const ordem: Record<Confianca, number> = { plena: 0, parcial: 1, sem_score: 2 };
  return linhas.sort((a, b) => {
    if (ordem[a.confianca] !== ordem[b.confianca]) return ordem[a.confianca] - ordem[b.confianca];
    if (a.confianca === "plena") return numero(b.score?.score_final) - numero(a.score?.score_final);
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}
