// Ferramenta `buscar_ultimo_vendedor_pos_venda` do servidor MCP nl-sales-hiper-mcp.
// Pós-venda (entrega, devolução, troca, garantia): o agente passa o id do lead e recebe de volta
// o vendedor que fechou a última venda com esse cliente, para transferir direto para ele.
//
// Fonte: tabela `negocios` do D1 nl-sales-desempenho-vendedores (binding DESEMPENHO_DB), que o
// roteador sincroniza todo dia às 03h UTC. Só leitura. Não precisa de token do CRM.

export const DESTINOS_PERMITIDOS = [
  "nEnSC239aVVTaZw3Looe50yjUFI2", // wesley KT
  "UJyOGDl9nTcer761afs8iHsUMlq2", // Mikhaell Machado
  "Z3I10gOT0kbuWNnQgSCD5Pdmp4a2", // Geicy Sousa
  "bbFv2CoAkBaMI3cVw6gmzDp9Jjd2", // Leonardo Oliveira
  "FUw2J2MCNGd0OYCARQK4sFtJihp2", // FRANCISCO MASCILON SOARES
];

export const DESCRICAO_FERRAMENTA =
  "Pós-venda: informa qual vendedor atendeu e fechou a última venda com este cliente, para você transferir o atendimento direto para essa pessoa. " +
  "Use SOMENTE quando o cliente já comprou e o assunto for entrega, devolução, troca, garantia ou problema com um pedido. " +
  "Informe o leadId do cliente. Se o retorno trouxer encontrado = true, transfira para o userId devolvido e não use consultar_desempenho_vendedores. " +
  "Se encontrado = false, siga o fluxo normal de transferência.";

const SQL = `SELECT n.attendant_user_id AS user_id, a.nome AS nome, n.last_moved_at AS ganho_em, n.pipeline_nome AS pipeline
               FROM negocios n LEFT JOIN atendentes a ON a.user_id = n.attendant_user_id
              WHERE n.lead_id = ?1 AND n.status = 'won' AND n.attendant_user_id IS NOT NULL
              ORDER BY datetime(n.last_moved_at) DESC, n.id DESC
              LIMIT 1`;

export async function buscarUltimoVendedorPosVenda(env, args) {
  if (!env.DESEMPENHO_DB) {
    return { encontrado: false, erro: "banco de desempenho nao esta conectado a este servidor" };
  }
  const leadId = String(args?.leadId ?? "").trim();
  if (!leadId) return { encontrado: false, motivo: "leadId obrigatorio" };
  let linha;
  try {
    const { results } = await env.DESEMPENHO_DB.prepare(SQL).bind(leadId).all();
    linha = (results ?? [])[0];
  } catch (e) {
    return { encontrado: false, erro: "falha ao consultar a base de negocios" };
  }
  if (!linha) {
    return {
      encontrado: false,
      motivo: "nenhuma venda fechada encontrada para este lead; siga o fluxo normal de transferencia",
    };
  }
  return {
    encontrado: true,
    userId: linha.user_id,
    nome: linha.nome ?? null,
    ganho_em: linha.ganho_em ?? null,
    pipeline: linha.pipeline ?? null,
    // Camila e Kayllane não estão na lista de destinos de lead novo; para pós-venda quem vendeu continua sendo o contato certo.
    recebe_lead_novo: DESTINOS_PERMITIDOS.includes(linha.user_id),
  };
}

export function registrarFerramentaUltimoVendedor(server, env, z) {
  server.registerTool(
    "buscar_ultimo_vendedor_pos_venda",
    {
      description: DESCRICAO_FERRAMENTA,
      inputSchema: { leadId: z.string().describe("ID do lead (cliente) no CRM") },
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await buscarUltimoVendedorPosVenda(env, args ?? {})) }],
    })
  );
}
