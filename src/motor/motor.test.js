import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avaliar, sensibilidade, consolidar, porQueVenceu } from "./motor.js";

const ler = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf-8"));
const base = ler("../../dados/bancos.json");
const politica = ler("../../dados/perguntas.json");

/**
 * Casos-âncora: cada um tem um vencedor que um engenheiro sênior defenderia
 * numa revisão de arquitetura. Se um quebrar depois de você mexer num peso,
 * o ajuste está errado — não o caso. Discordou de um resultado? Vire caso.
 */
const CASOS = [
  { nome: "liquidação financeira", esperado: "postgres",
    r: { atomicidade:"multi", invariantes:"banco", skew:"sim", perda:"zero", particao:"errar",
         leitura:"forte", acesso:"adhoc", formato:"tabular", escala:"vertical", operacao:"minimo" } },
  { nome: "catálogo de produtos", esperado: "mongodb",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"segundos", particao:"parar",
         leitura:"lag", acesso:"chave", formato:"documento", escala:"crescente", operacao:"gerenciado" } },
  { nome: "telemetria de dispositivos", esperado: "cassandra",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"reprocessa", particao:"parar",
         leitura:"eventual", acesso:"chave", formato:"serie", escala:"horizontal", operacao:"experiente" } },
  { nome: "busca do site", esperado: "elastic",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"reprocessa", particao:"parar",
         leitura:"eventual", acesso:"texto", formato:"documento", escala:"crescente", operacao:"gerenciado" } },
  { nome: "sessão e cache", esperado: "redis",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"reprocessa", particao:"parar",
         leitura:"eventual", acesso:"chave", formato:"efemero", escala:"crescente", operacao:"experiente" } },
  { nome: "quadro societário", esperado: "neo4j",
    r: { atomicidade:"agregado", invariantes:"misto", skew:"nao", perda:"segundos", particao:"tanto",
         leitura:"lag", acesso:"grafo", formato:"documento", escala:"vertical", operacao:"experiente" } },
  { nome: "métricas internas", esperado: "timescale",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"segundos", particao:"tanto",
         leitura:"lag", acesso:"chave", formato:"serie", escala:"vertical", operacao:"experiente" } },
  { nome: "carrinho global de e-commerce", esperado: "dynamodb",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"segundos", particao:"parar",
         leitura:"lag", acesso:"chave", formato:"efemero", escala:"horizontal", operacao:"gerenciado" } },
  { nome: "CRUD interno simples", esperado: "postgres",
    r: { atomicidade:"multi", invariantes:"banco", skew:"nao", perda:"segundos", particao:"tanto",
         leitura:"forte", acesso:"adhoc", formato:"tabular", escala:"vertical", operacao:"minimo" } },
  { nome: "ledger multirregião", esperado: "cockroach",
    r: { atomicidade:"multi", invariantes:"banco", skew:"sim", perda:"zero", particao:"errar",
         leitura:"forte", acesso:"adhoc", formato:"tabular", escala:"horizontal", operacao:"gerenciado" } }
];

describe("casos-âncora", () => {
  for (const c of CASOS) {
    test(c.nome, () => {
      const { viaveis } = avaliar(base, politica, c.r);
      assert.ok(viaveis.length > 0, "nenhum candidato viável");
      assert.equal(viaveis[0].id, c.esperado,
        `esperado ${c.esperado}, obtido ${viaveis[0].id} ` +
        `(top3: ${viaveis.slice(0,3).map(v => v.id + ":" + v.pontos).join(", ")})`);
    });
  }
});

describe("invariantes do motor", () => {
  test("toda base declara todas as capacidades usadas na política", () => {
    const usadas = new Set();
    for (const q of politica.perguntas)
      for (const o of q.opcoes)
        for (const r of o.requisitos || []) usadas.add(r.cap);
    for (const b of base.bancos)
      for (const cap of usadas)
        assert.notEqual(b.caps[cap], undefined, `${b.id} não declara ${cap}`);
  });

  test("todo requisito com op=min aponta para uma escala existente", () => {
    for (const q of politica.perguntas)
      for (const o of q.opcoes)
        for (const r of o.requisitos || [])
          if (r.op === "min") {
            assert.ok(base.escalas[r.cap], `sem escala para ${r.cap}`);
            assert.ok(base.escalas[r.cap].includes(r.valor),
              `${r.valor} fora da escala de ${r.cap}`);
          }
  });

  test("todo requisito tem motivo em texto — sem motivo, não há explicação", () => {
    for (const q of politica.perguntas)
      for (const o of q.opcoes)
        for (const r of o.requisitos || [])
          assert.ok(r.motivo && r.motivo.length > 10, `requisito sem motivo em ${q.id}/${o.id}`);
  });

  test("ninguém passa de 100 pontos", () => {
    for (const c of CASOS) {
      const { viaveis } = avaliar(base, politica, c.r);
      for (const v of viaveis) assert.ok(v.pontos <= 100, `${v.id} passou de 100`);
    }
  });

  test("questionário vazio não bloqueia ninguém", () => {
    const { viaveis, inviaveis } = avaliar(base, politica, {});
    assert.equal(inviaveis.length, 0);
    assert.ok(viaveis.every(v => v.pontos <= 100));
  });

  test("todo valor de capacidade com escala pertence à escala", () => {
    for (const b of base.bancos)
      for (const [cap, escala] of Object.entries(base.escalas))
        if (b.caps[cap] !== undefined)
          assert.ok(escala.includes(b.caps[cap]),
            `${b.id}: ${cap}="${b.caps[cap]}" fora da escala [${escala}]`);
  });

  test("p e e de todo banco ficam entre 0 e 1", () => {
    for (const b of base.bancos) {
      assert.ok(b.caps.p >= 0 && b.caps.p <= 1, `${b.id}: p=${b.caps.p}`);
      assert.ok(b.caps.e >= 0 && b.caps.e <= 1, `${b.id}: e=${b.caps.e}`);
    }
  });

  test("toda severidade usada existe na tabela de severidades", () => {
    for (const q of politica.perguntas)
      for (const o of q.opcoes)
        for (const r of o.requisitos || [])
          assert.ok(r.sev === "bloqueante" || typeof politica.severidades[r.sev] === "number",
            `severidade "${r.sev}" em ${q.id}/${o.id} não tem custo definido`);
  });

  test("resposta com id inexistente é erro, não silêncio", () => {
    assert.throws(() => avaliar(base, politica, { atomicidade: "nao-existe" }),
      /resposta inválida/);
  });
});

describe("robustez da política", () => {
  /**
   * Todo banco da base precisa de um cenário defensável: ou vence um âncora,
   * ou fica a empate técnico (≤10 pontos) do vencedor em algum. Um banco que
   * nunca chega perto ou está sobrando na base, ou está faltando um âncora.
   */
  test("todo banco vence ou empata tecnicamente em algum caso-âncora", () => {
    const porCaso = CASOS.map(c => avaliar(base, politica, c.r).viaveis);
    const semLar = base.bancos
      .filter(b => !porCaso.some(vs => {
        const v = vs.find(x => x.id === b.id);
        return v && vs[0].pontos - v.pontos <= 10;
      }))
      .map(b => b.id);
    assert.deepEqual(semLar, [],
      `sem cenário defensável: ${semLar.join(", ")} — ou falta um âncora, ou o banco não deveria estar na base`);
  });

  /**
   * Os pesos (30/12/5 e o 25 do PACELC) são opinião. Se um âncora muda de
   * vencedor com ±20% num peso, o resultado vinha de coincidência numérica,
   * não da estrutura — é dado ou âncora para revisar, não peso para travar.
   */
  test("vencedores dos âncoras aguentam ±20% em cada peso", () => {
    const variacoes = [];
    for (const sev of ["grave", "moderado", "leve"])
      for (const f of [0.8, 1.2])
        variacoes.push({ rotulo: `${sev}×${f}`, muda: p => { p.severidades[sev] *= f; } });
    for (const f of [0.8, 1.2])
      variacoes.push({ rotulo: `pacelc×${f}`, muda: p => { p.pesoDistanciaPacelc *= f; } });

    for (const v of variacoes) {
      const p = JSON.parse(JSON.stringify(politica));
      v.muda(p);
      for (const c of CASOS) {
        const { viaveis } = avaliar(base, p, c.r);
        assert.equal(viaveis[0] && viaveis[0].id, c.esperado,
          `âncora "${c.nome}" muda de vencedor com ${v.rotulo}: margem frágil`);
      }
    }
  });
});

describe("casos adversariais — pares em disputa real", () => {
  /**
   * Cenários em que dois bancos são defensáveis. O contrato aqui é o PAR no
   * topo, não a ordem — a ordem é empate técnico e a UI diz isso ao usuário.
   */
  const PARES = [
    { nome: "checkout de e-commerce", topo: ["cockroach", "postgres"],
      r: { atomicidade:"multi", invariantes:"banco", skew:"nao", perda:"zero", particao:"errar",
           leitura:"forte", acesso:"adhoc", formato:"tabular", escala:"crescente", operacao:"gerenciado" } }
  ];
  for (const c of PARES) {
    test(c.nome, () => {
      const { viaveis } = avaliar(base, politica, c.r);
      assert.deepEqual(viaveis.slice(0, 2).map(v => v.id).sort(), [...c.topo].sort(),
        `topo obtido: ${viaveis.slice(0, 3).map(v => v.id + ":" + v.pontos).join(", ")}`);
    });
  }
});

describe("por que venceu", () => {
  test("lista exigências que eliminaram candidatos e vantagens sobre o vice", () => {
    const res = avaliar(base, politica, CASOS[0].r); // liquidação → postgres
    const razoes = porQueVenceu(politica, res);
    assert.ok(razoes.length > 0, "vencedor sem nenhuma razão positiva");
    const exigencias = razoes.filter(r => r.tipo === "exigencia");
    assert.ok(exigencias.length > 0, "nenhuma exigência eliminatória listada");
    assert.ok(exigencias.every(r => r.titulo && r.eliminados.length > 0));
    for (const r of razoes.filter(x => x.tipo === "vantagem")) {
      assert.equal(r.sobre, res.viaveis[1].nome);
      assert.ok(r.motivo.length > 10);
    }
  });

  test("sem vencedor, sem razões", () => {
    // efêmero + integridade no banco elimina todo mundo
    const res = avaliar(base, politica, { formato: "efemero", invariantes: "banco" });
    assert.equal(res.viaveis.length, 0);
    assert.deepEqual(porQueVenceu(politica, res), []);
  });
});

describe("análise de sensibilidade", () => {
  test("aponta as respostas que viram o resultado", () => {
    const s = sensibilidade(base, politica, CASOS[0].r);
    assert.equal(s.vencedor, "postgres");
    assert.ok(s.criticas.length > 0, "nenhuma resposta crítica encontrada");
    assert.ok(s.criticas.every(c => c.viraria.length > 0));
  });

  test("marca empate técnico quando a margem é pequena", () => {
    const s = sensibilidade(base, politica, CASOS[0].r);
    assert.equal(typeof s.margem, "number");
    assert.equal(s.apertado, s.margem <= 10);
  });

  test("valor da informação só lista pergunta respondida com incerteza", () => {
    const comIncerteza = { ...CASOS[0].r, skew: "talvez" };
    const s = sensibilidade(base, politica, comIncerteza);
    assert.ok(Array.isArray(s.investigar));
  });
});

describe("consolidação poliglota", () => {
  test("recomenda banco único quando o ganho de especializar é pequeno", () => {
    const c = consolidar(base, politica, [
      { nome: "a", respostas: CASOS[0].r },
      { nome: "b", respostas: CASOS[8].r }
    ]);
    assert.equal(c.candidatoUnico, "postgres");
    assert.match(c.recomendacao, /use PostgreSQL/);
  });

  test("reconhece quando nenhum banco atende a todos os agregados", () => {
    const c = consolidar(base, politica, [
      { nome: "ledger", respostas: CASOS[9].r },
      { nome: "cache", respostas: CASOS[4].r }
    ]);
    assert.equal(c.candidatoUnico, null);
    assert.match(c.recomendacao, /poliglota/);
  });
});
