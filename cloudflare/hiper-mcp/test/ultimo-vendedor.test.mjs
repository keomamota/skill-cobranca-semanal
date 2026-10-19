import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarUltimoVendedorPosVenda } from "../src/ultimo-vendedor.js";

// D1 falso: guarda o SQL e os parâmetros e devolve as linhas combinadas.
function d1(rows, falha = false) {
  const chamadas = [];
  return {
    chamadas,
    prepare(sql) {
      return {
        bind(...params) {
          chamadas.push({ sql, params });
          return { all: async () => { if (falha) throw new Error("boom"); return { results: rows }; } };
        },
      };
    },
  };
}

test("devolve o vendedor da última venda com userId, nome e data", async () => {
  const db = d1([{ user_id: "UJyOGDl9nTcer761afs8iHsUMlq2", nome: "Mikhaell Machado", ganho_em: "2026-10-01T10:00:00.000Z", pipeline: "Vendas Nobre Lar" }]);
  const r = await buscarUltimoVendedorPosVenda({ DESEMPENHO_DB: db }, { leadId: " abc-123 " });
  assert.equal(r.encontrado, true);
  assert.equal(r.userId, "UJyOGDl9nTcer761afs8iHsUMlq2");
  assert.equal(r.nome, "Mikhaell Machado");
  assert.equal(r.recebe_lead_novo, true);
  assert.deepEqual(db.chamadas[0].params, ["abc-123"]); // id aparado e passado como parâmetro, nunca concatenado
});

test("a consulta filtra só negócios ganhos e ordena pelo mais recente", async () => {
  const db = d1([]);
  await buscarUltimoVendedorPosVenda({ DESEMPENHO_DB: db }, { leadId: "x" });
  const sql = db.chamadas[0].sql;
  assert.match(sql, /status = 'won'/);
  assert.match(sql, /ORDER BY datetime\(n\.last_moved_at\) DESC, n\.id DESC/); // desempate estável quando dois ganhos têm a mesma data
  assert.match(sql, /LIMIT 1/);
});

test("sem venda fechada devolve encontrado=false com o motivo, sem inventar vendedor", async () => {
  const r = await buscarUltimoVendedorPosVenda({ DESEMPENHO_DB: d1([]) }, { leadId: "x" });
  assert.equal(r.encontrado, false);
  assert.match(r.motivo, /fluxo normal/);
  assert.equal(r.userId, undefined);
});

test("vendedor fora da lista de destinos (ex.: Camila) ainda é devolvido, com recebe_lead_novo=false", async () => {
  const db = d1([{ user_id: "o62nkggR28bQTCrxUk5uXkkRSzs2", nome: "Camila Olinda", ganho_em: null, pipeline: null }]);
  const r = await buscarUltimoVendedorPosVenda({ DESEMPENHO_DB: db }, { leadId: "x" });
  assert.equal(r.encontrado, true);
  assert.equal(r.recebe_lead_novo, false);
  assert.equal(r.ganho_em, null);
});

test("nome ausente na tabela de atendentes vira null, e o userId continua", async () => {
  const r = await buscarUltimoVendedorPosVenda({ DESEMPENHO_DB: d1([{ user_id: "u1", nome: null, ganho_em: "x", pipeline: "p" }]) }, { leadId: "x" });
  assert.equal(r.encontrado, true);
  assert.equal(r.nome, null);
  assert.equal(r.userId, "u1");
});

test("leadId vazio, ausente ou só espaços não consulta o banco", async () => {
  const db = d1([]);
  for (const args of [{}, { leadId: "" }, { leadId: "   " }, undefined, { leadId: null }]) {
    const r = await buscarUltimoVendedorPosVenda({ DESEMPENHO_DB: db }, args);
    assert.equal(r.encontrado, false);
    assert.match(r.motivo, /leadId obrigatorio/);
  }
  assert.equal(db.chamadas.length, 0);
});

test("banco não conectado ou consulta com erro não derruba a ferramenta", async () => {
  assert.equal((await buscarUltimoVendedorPosVenda({}, { leadId: "x" })).encontrado, false);
  const r = await buscarUltimoVendedorPosVenda({ DESEMPENHO_DB: d1([], true) }, { leadId: "x" });
  assert.equal(r.encontrado, false);
  assert.match(r.erro, /falha/);
});
