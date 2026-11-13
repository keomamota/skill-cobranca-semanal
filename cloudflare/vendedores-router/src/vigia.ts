import { handoffAvaliar, type ArgsHandoff } from "./handoff";

/**
 * Vigia do repasse de 10 min: roda por cron do próprio Worker (sem depender das automações do Data Crazy).
 * A cada rodada lista as conversas recentes, pergunta ao mesmo motor do /handoff/avaliar se o cliente está
 * esperando há 10 min úteis e, no modo "ativo", troca o atendente. No modo "observacao" só grava o que faria.
 * O modo fica na tabela vigia_config (chave 'modo'), então liga/desliga sem publicar de novo.
 */

export type Modo = "observacao" | "ativo" | "desligado";

export interface DbVigia {
  prepare(sql: string): { bind(...a: unknown[]): { all(): Promise<{ results?: any[] }>; first(): Promise<any>; run(): Promise<unknown> } };
}

export interface ArgsVigia extends ArgsHandoff {
  /** ms de espera antes de conferir a conversa depois do repasse (padrão 8000; testes usam 0). */
  esperaConferenciaMs?: number;
  env: ArgsHandoff["env"] & { DB: DbVigia };
}

export interface ResumoRodada {
  modo: Modo | "fora_do_expediente";
  avaliadas: number;
  contagem: Record<string, number>;
}

const MIN = 60_000;
const FUSO_MS = 3 * 3_600_000; // Fortaleza, sem horário de verão

/** Seg–sex 7h–18h, sáb 7h–14h (hora de Fortaleza). */
export function dentroDoExpediente(agora: Date): boolean {
  const local = new Date(agora.getTime() - FUSO_MS);
  const dow = local.getUTCDay();
  const min = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (dow === 0) return false;
  const fecha = dow === 6 ? 14 * 60 : 18 * 60;
  return min >= 7 * 60 && min < fecha;
}

async function config(db: DbVigia, chave: string, padrao: string): Promise<string> {
  try {
    const r = await db.prepare("SELECT valor FROM vigia_config WHERE chave = ?").bind(chave).first();
    return (r?.valor as string | undefined) ?? padrao;
  } catch {
    return padrao;
  }
}

export async function varrerRepasses(a: ArgsVigia): Promise<ResumoRodada> {
  const db = a.env.DB;
  const modoCfg = (await config(db, "modo", "observacao")) as Modo;
  const modo: Modo = ["observacao", "ativo", "desligado"].includes(modoCfg) ? modoCfg : "observacao";
  if (modo === "desligado") return { modo, avaliadas: 0, contagem: {} };
  if (!dentroDoExpediente(a.agora)) return { modo: "fora_do_expediente", avaliadas: 0, contagem: {} };

  const maxPorRodada = Number(await config(db, "max_por_rodada", "20")) || 20;
  const desde = new Date(a.agora.getTime() - 72 * 60 * MIN).toISOString();
  const lista: any[] = [];
  for (let skip = 0; skip < 900; skip += 100) {
    const pag = await a.dc.call("conversation_list", { skip, limit: 100, status: "all", lastMessageGte: desde });
    const itens: any[] = Array.isArray(pag) ? pag : (pag?.data ?? []);
    lista.push(...itens);
    if (itens.length < 100) break;
  }

  const limite = a.agora.getTime() - 5 * MIN; // abaixo de 5 min corridos nem o pré-aviso vale; o repasse só ocorre aos 10 úteis
  const candidatas = lista
    .filter((c) => !c.isGroup && !c.finished && c.leadId && Date.parse(c.lastMessageDate) <= limite)
    .filter((c) => !(c.attendants ?? []).some((t: any) => t.name === "NL Sales"))
    .sort((x, y) => Date.parse(y.lastMessageDate) - Date.parse(x.lastMessageDate))
    .slice(0, maxPorRodada);

  const maxEspera = Number(await config(db, "max_espera_min", "240")) || 240;
  const maxRepasses = Number(await config(db, "max_repasses_por_rodada", "3")) || 3;
  const contagem: Record<string, number> = {};
  const token = a.env.ROUTER_BEARER_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const avaliar = async (leadId: string, atribuir: boolean) => {
    const url = `https://vigia.local/handoff/avaliar?leadId=${encodeURIComponent(leadId)}${atribuir ? "&atribuir=1" : ""}`;
    return (await (await handoffAvaliar(new Request(url, { method: "POST", headers }), a)).json()) as any;
  };
  let repassadas = 0;
  for (const c of candidatas) {
    let decisao: any;
    let trocou = false;
    try {
      decisao = await avaliar(c.leadId, false);
      if (decisao.acao === "repassar" && decisao.minutosSemResposta > maxEspera) {
        decisao = { ...decisao, acao: "fim", motivo: "espera_antiga_demais" };
      } else if (decisao.acao === "repassar" && modo === "ativo" && repassadas < maxRepasses) {
        decisao = await avaliar(c.leadId, true);
        if (decisao.acao === "repassar") {
          repassadas++;
          trocou = true;
          await conferirConversa(a, c, decisao);
        }
      }
    } catch (e) {
      decisao = { acao: "fim", motivo: "erro_vigia", minutosSemResposta: 0, proximo: null, erro: String(e).slice(0, 120) };
    }
    const chave = `${decisao.acao}:${decisao.motivo}`;
    contagem[chave] = (contagem[chave] ?? 0) + 1;
    if (decisao.acao === "fim" && decisao.motivo === "dentro_do_prazo" && (decisao.minutosSemResposta ?? 0) >= 5) {
      const donosAviso = (c.attendants ?? []).map((t: any) => a.mapaAtendentes[t.id] ?? t.name).filter(Boolean);
      await registrarAviso(db, c, "pre", donosAviso, decisao.minutosSemResposta);
    }
    if (trocou && decisao.proximo) await registrarAviso(db, c, "repasse", [decisao.proximo], decisao.minutosSemResposta ?? 10);
    if (decisao.acao === "sem_atendimento") {
      const jaAvisado = await db.prepare("SELECT 1 AS x FROM vigia_alertas WHERE lead_id = ? AND em >= datetime('now','-1 day')").bind(c.leadId).first().catch(() => null);
      if (jaAvisado) continue; // um aviso por lead por dia; não enche o registro a cada minuto
      const donosAlerta = (c.attendants ?? []).map((t: any) => a.mapaAtendentes[t.id] ?? t.name).filter(Boolean).join(",");
      await db
        .prepare("INSERT INTO vigia_alertas (lead_id, conversa_id, contato, minutos, motivo, donos) VALUES (?,?,?,?,?,?)")
        .bind(c.leadId, c.id, c.contactName ?? c.name ?? null, decisao.minutosSemResposta ?? 0, decisao.motivo, donosAlerta)
        .run();
    }
    if (decisao.acao !== "fim" || String(decisao.motivo).startsWith("erro")) {
      const donos = (c.attendants ?? []).map((t: any) => a.mapaAtendentes[t.id] ?? t.name).filter(Boolean).join(",");
      await db
        .prepare("INSERT INTO vigia_decisoes (lead_id, conversa_id, acao, motivo, minutos, proximo, donos, modo) VALUES (?,?,?,?,?,?,?,?)")
        .bind(c.leadId, c.id, decisao.acao, decisao.motivo, decisao.minutosSemResposta ?? 0, decisao.proximo ?? null, donos, trocou ? "ativo" : modo === "ativo" && decisao.acao === "repassar" ? "ativo_aguardando_vez" : modo)
        .run();
    }
  }
  await db
    .prepare("INSERT INTO vigia_rodadas (modo, listadas, avaliadas, contagem) VALUES (?,?,?,?)")
    .bind(modo, lista.length, candidatas.length, JSON.stringify(contagem))
    .run();
  return { modo, avaliadas: candidatas.length, contagem };
}

/** Depois de trocar o atendente do lead, registra de quem ficou a conversa (a conversa acompanha o lead?). */
async function conferirConversa(a: ArgsVigia, c: any, decisao: any): Promise<void> {
  try {
    await new Promise((r) => setTimeout(r, a.esperaConferenciaMs ?? 8000)); // a automação do Data Crazy leva alguns segundos para mover a conversa
    const convs = await a.dc.call("conversation_get_by_lead", { leadId: c.leadId });
    const cv = (Array.isArray(convs) ? convs : []).filter((x: any) => !x.isGroup).sort((x: any, y: any) => Date.parse(y.lastMessageDate ?? 0) - Date.parse(x.lastMessageDate ?? 0))[0];
    const donos = (cv?.attendants ?? []).map((t: any) => a.mapaAtendentes[t.id] ?? t.name).filter(Boolean).join(",");
    await a.env.DB
      .prepare("INSERT INTO vigia_decisoes (lead_id, conversa_id, acao, motivo, minutos, proximo, donos, modo) VALUES (?,?,?,?,?,?,?,?)")
      .bind(c.leadId, c.id, "conferencia", "conversa_depois_do_repasse", 0, decisao.proximo ?? null, donos, "ativo")
      .run();
  } catch {
    /* conferência é só informativa */
  }
}

/**
 * Aviso ao vendedor ("fulano, atenda o cliente"). Por enquanto só REGISTRA o texto em vigia_avisos (enviado = 0):
 * o envio por WhatsApp só liga depois da aprovação da Keoma. Um aviso por lead e tipo a cada 30 min.
 */
async function registrarAviso(db: DbVigia, c: any, tipo: "pre" | "repasse", para: string[], minutos: number): Promise<void> {
  const destinos = para.filter(Boolean);
  if (destinos.length === 0) return;
  const ja = await db.prepare("SELECT 1 AS x FROM vigia_avisos WHERE lead_id = ? AND tipo = ? AND em >= datetime('now','-30 minutes')").bind(c.leadId, tipo).first().catch(() => null);
  if (ja) return;
  const cliente = String(c.contactName ?? c.name ?? "cliente").split(" ")[0];
  const texto =
    tipo === "pre"
      ? `${cliente} está esperando há ${Math.round(minutos)} min na conversa. Atenda agora, antes de passar para outro vendedor.`
      : `Lead repassado para você: ${cliente} esperava há ${Math.round(minutos)} min. Atenda agora.`;
  for (const nome of destinos) {
    await db.prepare("INSERT INTO vigia_avisos (lead_id, conversa_id, tipo, para, texto, enviado) VALUES (?,?,?,?,?,0)").bind(c.leadId, c.id, tipo, nome, texto).run();
  }
}
