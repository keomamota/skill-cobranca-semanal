import { describe, expect, it } from "vitest";
import {
  classificarNegocio, resumirFunil, somarFunis, percentual, taxaResolucao, taxaGanhoBruta, funilVazio,
} from "../src/kpis/funil";

describe("classificarNegocio", () => {
  it("ganho e perdido vêm do status, em qualquer etapa", () => {
    expect(classificarNegocio({ status: "won", etapa: "Pós-venda" })).toBe("ganho");
    expect(classificarNegocio({ status: "won", etapa: "Frio" })).toBe("ganho");
    expect(classificarNegocio({ status: "lost", etapa: "Orçamento" })).toBe("perdido");
  });

  it("aberto nas etapas de venda é em atendimento, com ou sem acento e caixa", () => {
    for (const etapa of ["Novo Lead", "Qualificação", "Qualificacao", "ORÇAMENTO", "Negociação"]) {
      expect(classificarNegocio({ status: "in_process", etapa })).toBe("em_atendimento");
    }
    expect(classificarNegocio({ status: "in_process", etapa: "Qualificação" })).toBe("em_atendimento");
  });

  it("aberto em Frio é frio", () => {
    expect(classificarNegocio({ status: "in_process", etapa: "Frio" })).toBe("frio");
  });

  it("etapa de perda/ganho com status aberto, etapa vazia ou nova é inconsistente", () => {
    expect(classificarNegocio({ status: "in_process", etapa: "Clientes Perdidos " })).toBe("inconsistente");
    expect(classificarNegocio({ status: "in_process", etapa: "Ganho" })).toBe("inconsistente");
    expect(classificarNegocio({ status: "in_process", etapa: "Pós-venda" })).toBe("inconsistente");
    expect(classificarNegocio({ status: "in_process", etapa: null })).toBe("inconsistente");
    expect(classificarNegocio({ status: "in_process", etapa: "Etapa Nova" })).toBe("inconsistente");
  });

  it("status desconhecido ou vazio nunca vira atendimento", () => {
    expect(classificarNegocio({ status: "", etapa: "Orçamento" })).toBe("inconsistente");
    expect(classificarNegocio({ status: null, etapa: "Orçamento" })).toBe("inconsistente");
    expect(classificarNegocio({ status: "WON", etapa: "Ganho" })).toBe("ganho");
  });
});

describe("resumirFunil", () => {
  const linhas = [
    { vendedor_id: "a", status: "in_process", etapa: "Orçamento" },
    { vendedor_id: "a", status: "in_process", etapa: "Frio" },
    { vendedor_id: "a", status: "won", etapa: "Ganho" },
    { vendedor_id: "a", status: "lost", etapa: "Clientes Perdidos " },
    { vendedor_id: "a", status: "in_process", etapa: "Clientes Perdidos " },
    { vendedor_id: "b", status: "won", etapa: "Pós-venda" },
    { vendedor_id: null, status: "in_process", etapa: "Novo Lead" },
  ];

  it("conta cada situação por vendedor e agrupa sem vendedor", () => {
    const r = resumirFunil(linhas);
    expect(r.get("a")).toEqual({ total: 5, em_atendimento: 1, frio: 1, ganho: 1, perdido: 1, inconsistente: 1 });
    expect(r.get("b")).toEqual({ total: 1, em_atendimento: 0, frio: 0, ganho: 1, perdido: 0, inconsistente: 0 });
    expect(r.get("sem-vendedor")!.em_atendimento).toBe(1);
  });

  it("somarFunis soma todas as situações", () => {
    const t = somarFunis(resumirFunil(linhas).values());
    expect(t.total).toBe(7);
    expect(t.ganho).toBe(2);
  });

  it("lista vazia dá mapa vazio e funil vazio", () => {
    expect(resumirFunil([]).size).toBe(0);
    expect(somarFunis([])).toEqual(funilVazio());
  });
});

describe("taxas", () => {
  it("percentual arredonda só para exibir e protege total zero", () => {
    expect(percentual(1, 3)).toBe(33);
    expect(percentual(0, 0)).toBe(0);
  });

  it("taxa de resolução não arredonda e exclui Frio do denominador", () => {
    const r = { total: 250, em_atendimento: 10, frio: 50, ganho: 70, perdido: 69, inconsistente: 51 };
    expect(taxaResolucao(r)).toBeCloseTo(69.5, 5); // 139 de 200
  });

  it("sem funil ativo ou sem resolvidos devolve null", () => {
    expect(taxaResolucao({ ...funilVazio(), total: 5, frio: 5 })).toBeNull();
    expect(taxaGanhoBruta({ ...funilVazio(), total: 3, em_atendimento: 3 })).toBeNull();
    expect(taxaGanhoBruta({ ...funilVazio(), total: 4, ganho: 1, perdido: 3 })).toBe(25);
  });
});
