// Regra de distribuição em vigor, lida do código publicado do roteador
// (Worker nl-sales-vendedores-router, versão 600eba8c de 2026-10-02; cópia em
// cloudflare/vendedores-router/src/index.publicado-2026-10-02.js).
//
// A cada lead, o roteador escolhe, entre os DESTINOS_PERMITIDOS, quem está mais atrás da sua
// parte do dia. A parte de cada um é proporcional a score_final ao quadrado (ENFASE_RANKING = 2).
// Quem não está na lista de destinos (hoje Camila e Kayllane) não recebe lead.
import type { ScoreVendedor } from "./ranking";

export const REGRA_EM_VIGOR = {
  tipo: "proporcional_ao_score_ao_quadrado" as const,
  desde: "2026-09-15",
  enfase: 2,
  descricao:
    "Distribuição proporcional ao score ao quadrado entre os vendedores permitidos (Wesley, Mikhaell, Geicy, Leonardo e Francisco); quem não está na lista de destinos (Camila e Kayllane) não recebe lead. Antes de 15/09 era sorteio ponderado, com reserva fixa em agosto.",
  destinosPermitidos: [
    "nEnSC239aVVTaZw3Looe50yjUFI2", // wesley KT
    "UJyOGDl9nTcer761afs8iHsUMlq2", // Mikhaell Machado
    "Z3I10gOT0kbuWNnQgSCD5Pdmp4a2", // Geicy Sousa
    "bbFv2CoAkBaMI3cVw6gmzDp9Jjd2", // Leonardo Oliveira
    "FUw2J2MCNGd0OYCARQK4sFtJihp2", // FRANCISCO MASCILON SOARES
  ] as string[],
};

// Peso relativo de cada vendedor permitido: score_final elevado à ênfase (score nulo ou negativo = 0).
export function pesosDaRegra(scores: Pick<ScoreVendedor, "user_id" | "score_final">[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of scores) {
    if (!REGRA_EM_VIGOR.destinosPermitidos.includes(s.user_id)) continue;
    const f = Number.isFinite(s.score_final) ? Math.max(s.score_final, 0) : 0;
    out[s.user_id] = Math.pow(f, REGRA_EM_VIGOR.enfase);
  }
  return out;
}
