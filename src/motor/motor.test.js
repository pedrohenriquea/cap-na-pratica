import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  avaliar, sensibilidade, consolidar, porQueVenceu,
  expandirPolitica, capsDe, variacoesDePeso, robustez, faixa
} from "./motor.js";
import { posicionarNumeros } from "../web/plano.js";

const ler = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf-8"));
const base = ler("../../dados/bancos.json");
const politica = ler("../../dados/perguntas.json");
const expandida = expandirPolitica(base, politica);

/**
 * Casos-âncora: cada um tem um vencedor que um engenheiro sênior defenderia
 * numa revisão de arquitetura. Se um quebrar depois de você mexer num peso,
 * o ajuste está errado — não o caso. Discordou de um resultado? Vire caso.
 */
const CASOS = [
  { nome: "liquidação financeira", esperado: "postgres",
    r: { atomicidade:"multi", invariantes:"banco", skew:"sim", perda:"zero", geografia:"local",
         particao:"errar", leitura:"forte", latencia:"tolerante", acesso:"adhoc", formato:"tabular",
         escala:"vertical", operacao:"minimo", hospedagem:"nuvem", incumbente:"nenhum" } },
  { nome: "catálogo de produtos", esperado: "mongodb",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"segundos", geografia:"local",
         particao:"parar", leitura:"lag", latencia:"web", acesso:"chave", formato:"documento",
         escala:"crescente", operacao:"gerenciado", hospedagem:"nuvem", incumbente:"nenhum" } },
  { nome: "telemetria de dispositivos", esperado: "cassandra",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"reprocessa", geografia:"local",
         particao:"parar", leitura:"eventual", latencia:"critico", acesso:"chave", formato:"serie",
         escala:"horizontal", operacao:"experiente", hospedagem:"nuvem", incumbente:"nenhum" } },
  { nome: "busca do site", esperado: "elastic",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"reprocessa", geografia:"local",
         particao:"parar", leitura:"eventual", latencia:"critico", acesso:"texto", formato:"documento",
         escala:"crescente", operacao:"gerenciado", hospedagem:"nuvem", incumbente:"nenhum" } },
  { nome: "sessão e cache", esperado: "redis",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"reprocessa", geografia:"local",
         particao:"parar", leitura:"eventual", latencia:"critico", acesso:"chave", formato:"efemero",
         escala:"crescente", operacao:"experiente", hospedagem:"nuvem", incumbente:"nenhum" } },
  { nome: "quadro societário", esperado: "neo4j",
    r: { atomicidade:"agregado", invariantes:"misto", skew:"nao", perda:"segundos", geografia:"local",
         particao:"tanto", leitura:"lag", latencia:"web", acesso:"grafo", formato:"documento",
         escala:"vertical", operacao:"experiente", hospedagem:"nuvem", incumbente:"nenhum" } },
  { nome: "métricas internas", esperado: "timescale",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"segundos", geografia:"local",
         particao:"tanto", leitura:"lag", latencia:"web", acesso:"chave", formato:"serie",
         escala:"vertical", operacao:"experiente", hospedagem:"nuvem", incumbente:"nenhum" } },
  { nome: "carrinho global de e-commerce", esperado: "dynamodb",
    r: { atomicidade:"agregado", invariantes:"app", skew:"nao", perda:"segundos", geografia:"escrita-global",
         particao:"parar", leitura:"lag", latencia:"critico", acesso:"chave", formato:"efemero",
         escala:"horizontal", operacao:"gerenciado", hospedagem:"nuvem", incumbente:"nenhum" } },
  { nome: "CRUD interno simples", esperado: "postgres",
    r: { atomicidade:"multi", invariantes:"banco", skew:"nao", perda:"segundos", geografia:"local",
         particao:"tanto", leitura:"forte", latencia:"tolerante", acesso:"adhoc", formato:"tabular",
         escala:"vertical", operacao:"minimo", hospedagem:"nuvem", incumbente:"nenhum" } },
  { nome: "ledger multirregião", esperado: "cockroach",
    r: { atomicidade:"multi", invariantes:"banco", skew:"sim", perda:"zero", geografia:"escrita-global",
         particao:"errar", leitura:"forte", latencia:"tolerante", acesso:"adhoc", formato:"tabular",
         escala:"horizontal", operacao:"gerenciado", hospedagem:"nuvem", incumbente:"nenhum" } },
  // o incumbente decide o empate técnico: o mesmo CRUD, numa casa que já opera MySQL
  { nome: "CRUD interno numa casa MySQL", esperado: "mysql",
    r: { atomicidade:"multi", invariantes:"banco", skew:"nao", perda:"segundos", geografia:"local",
         particao:"tanto", leitura:"forte", latencia:"tolerante", acesso:"adhoc", formato:"tabular",
         escala:"vertical", operacao:"minimo", hospedagem:"nuvem", incumbente:"mysql" } }
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

  test("todo âncora responde todas as perguntas — o que o usuário vê é o que o teste vigia", () => {
    const ids = politica.perguntas.map(q => q.id);
    for (const c of CASOS)
      for (const id of ids)
        assert.ok(c.r[id], `âncora "${c.nome}" não responde ${id}`);
  });
});

describe("invariantes do motor", () => {
  test("toda base declara todas as capacidades usadas na política", () => {
    const usadas = new Set();
    for (const q of expandida.perguntas)
      for (const o of q.opcoes)
        for (const r of o.requisitos || []) usadas.add(r.cap);
    for (const b of base.bancos)
      for (const cap of usadas)
        assert.notEqual(capsDe(b)[cap], undefined, `${b.id} não declara ${cap}`);
  });

  test("todo requisito com op=min aponta para uma escala existente", () => {
    for (const q of expandida.perguntas)
      for (const o of q.opcoes)
        for (const r of o.requisitos || [])
          if (r.op === "min") {
            assert.ok(base.escalas[r.cap], `sem escala para ${r.cap}`);
            assert.ok(base.escalas[r.cap].includes(r.valor),
              `${r.valor} fora da escala de ${r.cap}`);
          }
  });

  test("todo requisito tem motivo em texto — sem motivo, não há explicação", () => {
    for (const q of expandida.perguntas)
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

  /**
   * Os números p/e são opinião; a classe PACELC declarada, com motivo, é o
   * que se pode discutir. O número precisa cair na faixa da classe — senão
   * o gráfico conta uma história e o texto conta outra.
   */
  test("todo banco declara classe PACELC com motivo, e o número cai na faixa da classe", () => {
    for (const b of base.bancos) {
      assert.ok(b.pacelc && b.pacelc.motivo && b.pacelc.motivo.length > 20, `${b.id} sem classe PACELC justificada`);
      for (const eixo of ["p", "e"]) {
        const faixaDaClasse = base.faixasPacelc[eixo][b.pacelc[eixo]];
        assert.ok(faixaDaClasse, `${b.id}: classe ${eixo}="${b.pacelc[eixo]}" desconhecida`);
        const v = b.caps[eixo];
        assert.ok(v >= faixaDaClasse[0] && v <= faixaDaClasse[1],
          `${b.id}: ${eixo}=${v} fora da faixa ${b.pacelc[eixo]} [${faixaDaClasse}]`);
      }
    }
  });

  test("toda severidade usada existe na tabela de severidades", () => {
    for (const q of expandida.perguntas)
      for (const o of q.opcoes)
        for (const r of o.requisitos || [])
          assert.ok(r.sev === "bloqueante" || typeof politica.severidades[r.sev] === "number",
            `severidade "${r.sev}" em ${q.id}/${o.id} não tem custo definido`);
  });

  test("resposta com id inexistente é erro, não silêncio", () => {
    assert.throws(() => avaliar(base, politica, { atomicidade: "nao-existe" }),
      /resposta inválida/);
  });

  test("toda pergunta pertence a um grupo declarado (tópico do CAP/PACELC)", () => {
    const ids = new Set((politica.grupos || []).map(g => g.id));
    assert.ok(ids.size > 0, "política sem grupos declarados");
    for (const q of politica.perguntas)
      assert.ok(ids.has(q.grupo), `pergunta ${q.id} sem grupo válido: "${q.grupo}"`);
    for (const g of politica.grupos)
      assert.ok(g.selo && g.titulo && g.descricao, `grupo ${g.id} sem selo/título/descrição`);
  });

  test("duas perguntas no mesmo eixo PACELC viram média, não sobrescrita", () => {
    // read-your-writes forte (e=0.92) + latência crítica (e=0.15) → meio-termo
    const { alvo } = avaliar(base, politica, { leitura: "forte", latencia: "critico" });
    assert.equal(alvo.e, +((0.92 + 0.15) / 2).toFixed(3));
    assert.equal(alvo.p, 0.5, "eixo sem contribuição fica no neutro");
  });

  /**
   * Requisito que nenhum banco reprova é ruído — a menos que esteja declarado
   * `latente`: existe para o próximo banco (um SQLite reprovaria transação,
   * distribuição e serviço gerenciado). Inércia declarada, não acidental.
   */
  test("nenhum requisito é letra morta: cada um reprova ao menos um banco, ou se declara latente", () => {
    const mortos = [];
    for (const q of expandida.perguntas)
      for (const o of q.opcoes)
        for (const r of o.requisitos || []) {
          if (r.latente) continue;
          const reprova = base.bancos.some(b => {
            const caps = capsDe(b);
            return r.op === "min"
              ? base.escalas[r.cap].indexOf(caps[r.cap]) < base.escalas[r.cap].indexOf(r.valor)
              : r.op === "eq" ? caps[r.cap] !== r.valor : !r.valor.includes(caps[r.cap]);
          });
          if (!reprova) mortos.push(`${q.id}/${o.id}/${r.cap}`);
        }
    assert.deepEqual(mortos, [], `requisitos que nunca disparam: ${mortos.join(", ")}`);
  });
});

describe("pergunta gerada da base (incumbente)", () => {
  test("uma opção por banco, extensões de fora, mais a opção fixa", () => {
    const q = expandida.perguntas.find(x => x.id === "incumbente");
    const ids = q.opcoes.map(o => o.id);
    assert.ok(ids.includes("nenhum"));
    assert.ok(ids.includes("postgres"));
    assert.ok(!ids.includes("timescale"), "extensão não é opção: já está coberta pelo Postgres");
    assert.equal(q.opcoesDe, undefined, "pergunta expandida perde o opcoesDe (idempotência)");
    assert.deepEqual(expandirPolitica(base, expandida), expandida);
  });

  test("quem já opera Postgres já opera Timescale", () => {
    const { viaveis } = avaliar(base, politica, { ...CASOS[6].r, incumbente: "postgres" }); // métricas → timescale
    const ts = viaveis.find(v => v.id === "timescale");
    assert.ok(!ts.perdas.some(p => p.capacidade === "sistema"), "Timescale pagou custo de adoção sendo Postgres");
  });

  test("o incumbente vira um empate técnico, mas não vence um especialista", () => {
    const busca = { ...CASOS[3].r, incumbente: "postgres" };
    const { viaveis } = avaliar(base, politica, busca);
    assert.equal(viaveis[0].id, "elastic", "Postgres na casa não deveria vencer a busca do site");
  });
});

describe("residência do dado", () => {
  test("on-premises elimina o que só existe num provedor de nuvem", () => {
    const { inviaveis } = avaliar(base, politica, { ...CASOS[7].r, hospedagem: "proprio" });
    const dyn = inviaveis.find(b => b.id === "dynamodb");
    assert.ok(dyn, "DynamoDB deveria estar fora com dado on-premises");
    assert.equal(dyn.bloqueios[0].capacidade, "autoHospedado");
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
   * A mesma bateria é a que a interface mostra ao usuário (robustez()).
   */
  test("vencedores dos âncoras aguentam ±20% em cada peso", () => {
    for (const c of CASOS) {
      const r = robustez(base, politica, c.r);
      assert.equal(r.total, 8);
      assert.ok(r.robusto,
        `âncora "${c.nome}" muda de vencedor com ${r.viradas.map(v => `${v.rotulo} → ${v.vencedor}`).join("; ")}: margem frágil`);
    }
  });

  test("robustez() acusa um resultado que depende de um peso", () => {
    // sem incumbente e com o CRUD, Postgres vence MySQL por pouco; com o peso do
    // 'leve' zerado o grafo deixa de contar e a disputa fica no ruído
    const pol = JSON.parse(JSON.stringify(politica));
    pol.severidades.leve = 0;
    const r = robustez(base, pol, CASOS[8].r);
    assert.equal(typeof r.robusto, "boolean");
    assert.equal(variacoesDePeso(politica).length, 8);
  });

  test("faixa traduz pontos em ordem, não em medida", () => {
    assert.equal(faixa(politica, 91), "forte");
    assert.equal(faixa(politica, 70), "viavel");
    assert.equal(faixa(politica, 40), "ressalvas");
    const { viaveis } = avaliar(base, politica, CASOS[0].r);
    assert.equal(viaveis[0].faixa, faixa(politica, viaveis[0].pontos));
  });
});

describe("casos adversariais — pares em disputa real", () => {
  /**
   * Cenários em que dois bancos são defensáveis. O contrato aqui é o PAR no
   * topo, não a ordem — a ordem é empate técnico e a UI diz isso ao usuário.
   */
  const PARES = [
    { nome: "checkout de e-commerce", topo: ["cockroach", "postgres"],
      r: { atomicidade:"multi", invariantes:"banco", skew:"nao", perda:"zero", geografia:"leitura-global",
           particao:"errar", leitura:"forte", latencia:"tolerante", acesso:"adhoc", formato:"tabular",
           escala:"crescente", operacao:"gerenciado", hospedagem:"nuvem", incumbente:"nenhum" } }
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

describe("plano PACELC legível", () => {
  const rotulos = posicionarNumeros(base.bancos);

  test("nenhum número sobrepõe outro número", () => {
    for (let i = 0; i < rotulos.length; i++)
      for (let j = i + 1; j < rotulos.length; j++) {
        const a = rotulos[i].caixa, b = rotulos[j].caixa;
        assert.ok(!(a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1),
          `números de ${rotulos[i].id} e ${rotulos[j].id} sobrepostos`);
      }
  });

  test("nenhum número cobre o ponto de outro banco", () => {
    for (const r of rotulos)
      for (const p of rotulos) {
        if (r.id === p.id) continue;
        const c = r.caixa;
        const cobre = c.x1 < p.cx + 1.9 && c.x2 > p.cx - 1.9 && c.y1 < p.cy + 1.9 && c.y2 > p.cy - 1.9;
        assert.ok(!cobre, `número de ${r.id} cobre o ponto de ${p.id}`);
      }
  });

  test("todo número fica dentro da área visível", () => {
    for (const r of rotulos)
      assert.ok(r.caixa.x1 >= 1 && r.caixa.x2 <= 99 && r.caixa.y1 >= 10 && r.caixa.y2 <= 92,
        `número de ${r.id} fora da área: ${JSON.stringify(r.caixa)}`);
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
