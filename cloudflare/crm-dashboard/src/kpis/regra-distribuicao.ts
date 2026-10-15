// Regra de distribuição em vigor, lida do código publicado do roteador (Task 0).
// A tela só descreve o que está aqui; se a regra mudar, atualize este arquivo junto com a data.
export const REGRA_EM_VIGOR = {
  tipo: "cota_diaria" as const,
  desde: "2026-09-15",
  descricao:
    "Cota diária de leads por vendedor (antes de 15/09 era sorteio ponderado pelo score, com reserva fixa em agosto).",
  // user_id -> cota em leads por dia, conforme o código publicado. Vazio até a Task 0, passo 3.
  cotaDia: {} as Record<string, number>,
};
