import { describe, expect, it } from "vitest";
import { leadsSemVendedor } from "../src/saude";

const neg = (leadId: string, attendantName: string | null = null) => ({ leadId, leadName: "x", attendantName, lastMovedAt: "2026-11-04T14:00:00Z" });

function dc(leads: Record<string, any>) {
  return {
    async call(tool: string, args: { id: string }) {
      if (tool !== "lead_get") throw new Error("tool inesperada");
      const l = leads[args.id];
      if (l instanceof Error) throw l;
      return l;
    },
  };
}

describe("leadsSemVendedor", () => {
  it("mede pelo atendente do LEAD: negócio sem atendente, mas lead com vendedor, não conta", async () => {
    const r = await leadsSemVendedor([neg("a"), neg("b")], dc({ a: { attendant: { userId: "u1", name: "Geicy" } }, b: { attendant: null } }));
    expect(r.map((n) => n.leadId)).toEqual(["b"]);
  });

  it("lead com userId vazio conta como sem vendedor", async () => {
    const r = await leadsSemVendedor([neg("a")], dc({ a: { attendant: { userId: "", name: null } } }));
    expect(r).toHaveLength(1);
  });

  it("se a leitura do lead falhar, cai para o atendente do negócio", async () => {
    const r = await leadsSemVendedor([neg("a", "Geicy"), neg("b", null)], dc({ a: new Error("500"), b: new Error("500") }));
    expect(r.map((n) => n.leadId)).toEqual(["b"]);
  });

  it("negócio sem leadId usa o atendente do negócio", async () => {
    const r = await leadsSemVendedor([{ ...neg("x"), leadId: undefined as any }], dc({}));
    expect(r).toHaveLength(1);
  });

  it("acima do limite de leituras, o restante usa o atendente do negócio (não estoura o limite de chamadas)", async () => {
    const lista = Array.from({ length: 5 }, (_, i) => neg("l" + i, null));
    let chamadas = 0;
    const cliente = { async call() { chamadas++; return { attendant: { userId: "u" } }; } };
    const r = await leadsSemVendedor(lista, cliente, { max: 2 });
    expect(chamadas).toBe(2);
    expect(r.map((n) => n.leadId)).toEqual(["l2", "l3", "l4"]);
  });
});
