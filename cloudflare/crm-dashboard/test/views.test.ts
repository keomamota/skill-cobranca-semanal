import { describe, expect, it } from "vitest";
import { esc, primeiroNome, renderShell } from "../src/views/layout";
import { renderVendedores, type DadosVendedores } from "../src/views/vendedores";
import { renderKpis, type DadosKpis } from "../src/views/kpis";
import { METAS_PADRAO } from "../src/kpis/metas";
import { funilVazio } from "../src/kpis/funil";
import { avaliarQualidadeLeads } from "../src/kpis/qualidade";

describe("layout", () => {
  it("escapa HTML, aspas duplas e simples, e aceita nulo", () => {
    expect(esc(`<script>alert("x")</script>`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(esc("a'b")).toBe("a&#39;b");
    expect(esc(null)).toBe("");
  });

  it("primeiro nome: telefone formatado, número, e-mail e vazio viram cliente", () => {
    expect(primeiroNome("Maria Neci Bezerra")).toBe("Maria");
    for (const t of ["558893152163", "(88) 99315-2163", "12345", "a@b.com", "", null]) {
      expect(primeiroNome(t as string | null)).toBe("cliente");
    }
  });

  it("menu tem as duas entradas e marca a ativa com aria-current", () => {
    const html = renderShell({ titulo: "t", ativo: "vend", selo: "s", conteudo: "<p>x</p>" });
    expect(html).toContain("NL Sales KPIs");
    expect(html).toContain("Performance por vendedor");
    expect(html).toContain('data-view="vend" class="on" aria-current="page"');
    expect(html).not.toContain('data-view="kpi" class="on"');
  });
});

const score = { user_id: "a", nome: "Ana <b>", resolvidos: 5, taxa_resolucao: 0.2, taxa_ganho_suavizada: 0.3, mediana_minutos_resposta: 1, score_velocidade: 100, score_resolucao: 40, score_ganho: 30, score_final: 55, calculado_em: "2026-10-15 03:01:03" };
const leads = { user_id: "a", n: 7, pct: 50, ultimo: "2026-10-15 10:00:00", dias: 0, foraDaDistribuicao: false, cotaDia: 5, pctCota: 25, desvioPP: 25, destaque: true };
const dv: DadosVendedores = {
  linhas: [
    { user_id: "a", nome: "Ana <b>", score, confianca: "parcial", nota: "confiança parcial: 5 resolvidos", funil: { ...funilVazio(), total: 10, em_atendimento: 2, frio: 3, ganho: 2, perdido: 2, inconsistente: 1 }, leads },
    { user_id: "b", nome: "Beto", score: { ...score, user_id: "b", nome: "Beto", resolvidos: 20, score_final: 70 }, confianca: "plena", nota: null, funil: funilVazio(), leads: null },
  ],
  b2b: [{ nome: "Beto", funil: { ...funilVazio(), total: 3, em_atendimento: 3 } }],
  totalLeads: 14,
  regra: { descricao: "Cota diária por vendedor.", desde: "2026-09-15", cotaConfigurada: true },
  calculadoEm: "2026-10-15 03:01:03",
  desatualizado: false,
  janelaLeads: 60,
  semVendedor: { semAtendente: 4, novos: 14, saudavel: false },
};

describe("renderVendedores", () => {
  it("mostra critérios, regra em vigor, seletor 7/30/60 e escapa nomes", () => {
    const html = renderVendedores(dv);
    expect(html).toContain("Velocidade 30%");
    expect(html).toContain("Cota diária por vendedor.");
    expect(html).toContain('href="?dias=7"');
    expect(html).toContain('href="?dias=60" aria-current="true"');
    expect(html).toContain("Ana &lt;b&gt;");
    expect(html).not.toContain("Ana <b>");
  });

  it("destaca o desvio da cota acima de 10 pp com o valor", () => {
    const html = renderVendedores(dv);
    expect(html).toContain("cota 5/dia");
    expect(html).toContain("desvio +25,0 pp (acima de 10 pp)");
  });

  it("plena recebe posição; parcial fica fora da ordem e em grupo próprio", () => {
    const html = renderVendedores(dv);
    expect(html).toContain("1. Beto");
    expect(html).not.toContain("1. Ana");
    expect(html).toContain("fora da ordem do ranking");
  });

  it("mostra leads sem vendedor, B2B separado e o aviso de dado antigo", () => {
    const html = renderVendedores({ ...dv, desatualizado: true });
    expect(html).toContain("Leads sem vendedor nas últimas 24 h: <b>4</b> de 14");
    expect(html).toContain("Prospecção B2B (separado do varejo)");
    expect(html).toContain("Mostrando dados de");
  });

  it("calculadoEm nulo não escreve data vazia", () => {
    const html = renderVendedores({ ...dv, calculadoEm: null, desatualizado: true });
    expect(html).toContain("data desconhecida");
    expect(html).not.toContain("dados de  (UTC)");
  });

  it("não escreve telefone nem juízo de valor", () => {
    const html = renderVendedores(dv);
    expect(html).not.toMatch(/\d{2}\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/);
    expect(html).not.toMatch(/\d{10,}/);
    expect(html.toLowerCase()).not.toMatch(/\bpior\b|\bmelhor\b/);
  });

  it("larguras das barras saem com 2 casas, sem sequências longas de dígitos", () => {
    const l = { ...dv.linhas[1], funil: { ...funilVazio(), total: 7, em_atendimento: 1, frio: 2, ganho: 1, perdido: 2, inconsistente: 1 } };
    const html = renderVendedores({ ...dv, linhas: [l] });
    expect(html).not.toMatch(/\d{10,}/);
    expect(html).toContain("width:14.29%");
  });

  it("score nulo ou NaN não derruba a página", () => {
    const l = { ...dv.linhas[1], score: { ...score, score_final: NaN } };
    expect(() => renderVendedores({ ...dv, linhas: [l] })).not.toThrow();
    const sem = { ...dv.linhas[1], score: null, confianca: "sem_score" as const, nota: "sem score calculado ainda" };
    expect(renderVendedores({ ...dv, linhas: [sem] })).toContain("Sem score");
  });
});

const dk: DadosKpis = {
  qualidade: avaliarQualidadeLeads({ total: 100, validas: 95, casam: 90 }),
  fechada: { inicio: "2026-08-31", leads: 56, ganhos: 4, por100: 7.142857, parcial: false },
  anterior: { inicio: "2026-08-24", leads: 40, ganhos: 2, por100: 5, parcial: false },
  serie: [
    { inicio: "2026-08-24", leads: 40, ganhos: 2, por100: 5, parcial: false },
    { inicio: "2026-08-31", leads: 56, ganhos: 4, por100: 7.142857, parcial: false },
    { inicio: "2026-09-21", leads: 74, ganhos: 6, por100: 8.1, parcial: true },
  ],
  resolucao: { valor: 41.2, status: "abaixo", resolvidos: 130, ativos: 316 },
  metas: METAS_PADRAO,
  candidatos: { total: 20, inconsistentes: 15, parados: 4, semData: 1 },
  parados7d: 9,
  semVendedor: { semAtendente: 4, novos: 14 },
  calculadoEm: "2026-10-15 03:00:29",
  desatualizado: false,
};

describe("renderKpis", () => {
  it("com dado confiável mostra o norte com uma casa decimal e a coorte parcial tracejada", () => {
    const html = renderKpis(dk);
    expect(html).toContain("7,1");
    expect(html).toContain("parcial");
    expect(html).toContain("Semana anterior: 5,0");
  });

  it("sem qualidade de lead, o norte fica indisponível e dá o motivo (nada de número bonito)", () => {
    const q = avaliarQualidadeLeads({ total: 1103, validas: 618, casam: 511 });
    const html = renderKpis({ ...dk, qualidade: q });
    expect(html).toContain("Indisponível por ora");
    expect(html).toContain("não trazem o id real do lead");
    expect(html).not.toContain("ganhos por 100 leads</small>");
  });

  it("as quatro obsessões levam o rótulo provisória com a data de revisão e chip com ícone", () => {
    const html = renderKpis(dk);
    expect((html.match(/provisória, revisão em 2026-12-04/g) ?? []).length).toBe(4);
    expect(html).toContain("Abaixo da meta");
    expect(html).toContain("<svg");
    expect(html).toContain("Em coleta");
  });

  it("resolução sem funil ativo mostra '—' e não 'amostra pequena' enganosa", () => {
    const html = renderKpis({ ...dk, resolucao: { valor: null, status: null, resolvidos: 0, ativos: 0 } });
    expect(html).toContain("Sem funil ativo");
  });

  it("dado antigo e data nula", () => {
    expect(renderKpis({ ...dk, desatualizado: true })).toContain("Mostrando dados de");
    expect(renderKpis({ ...dk, calculadoEm: null, desatualizado: true })).toContain("data desconhecida");
  });
});
