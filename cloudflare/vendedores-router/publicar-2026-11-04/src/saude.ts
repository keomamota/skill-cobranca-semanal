export interface NegocioNovo {
  leadId?: string | null;
  leadName?: string | null;
  attendantName?: string | null;
  lastMovedAt?: string | null;
}

/**
 * Negócios novos cujo LEAD está sem vendedor. O negócio nasce sem atendente (criado pela automação)
 * e só ganha dono quando o vendedor assume; quem o roteador define é o atendente do lead.
 * Se a leitura do lead falhar (ou passar do limite de leituras), cai para o atendente do negócio.
 */
export async function leadsSemVendedor<T extends NegocioNovo>(
  negocios: T[],
  dc: { call(tool: string, args: Record<string, unknown>): Promise<any> },
  opcoes: { max?: number; paralelo?: number } = {},
): Promise<T[]> {
  const max = opcoes.max ?? 100;
  const paralelo = opcoes.paralelo ?? 8;
  const sem: boolean[] = negocios.map((n) => !n.attendantName);
  let proximo = 0;
  const limite = Math.min(max, negocios.length);
  async function trabalhador() {
    while (proximo < limite) {
      const i = proximo++;
      const n = negocios[i];
      if (!n.leadId) continue;
      try {
        const lead = await dc.call("lead_get", { id: n.leadId });
        sem[i] = !lead?.attendant?.userId;
      } catch {
        // mantém o resultado pelo atendente do negócio
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(paralelo, limite) }, trabalhador));
  return negocios.filter((_, i) => sem[i]);
}
