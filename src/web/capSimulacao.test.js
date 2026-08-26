import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { novoJogo, passoAtual, opcoes, agir, letras, veredito } from "./capSimulacao.js";

const base = JSON.parse(readFileSync(new URL("../../dados/bancos.json", import.meta.url), "utf-8"));

const jogar = ids => ids.reduce((j, id) => agir(j, id).jogo, novoJogo());

describe("simulação CAP", () => {
  test("caminho AP/EL: quem escolhe ficar no ar e ser rápido cai no canto do Cassandra", () => {
    const j = jogar(["gravar", "ler", "partir", "gravar2", "responder-velho", "religar", "assincrona"]);
    assert.equal(j.fase, "fim");
    const v = veredito(j, base.bancos);
    assert.equal(v.quadrante, "PA/EL");
    assert.equal(v.vizinhos[0].id, "cassandra");
  });

  test("caminho CP/EC: quem escolhe parar e ler atual cai no canto do Postgres/Cockroach", () => {
    const j = jogar(["gravar", "ler", "partir", "gravar2", "recusar", "religar", "sincrona"]);
    const v = veredito(j, base.bancos);
    assert.equal(v.quadrante, "PC/EC");
    const ids = v.vizinhos.map(x => x.id);
    assert.ok(ids.includes("cockroach"), `vizinhos: ${ids}`);
    assert.ok(!ids.includes("timescale"), "extensão não serve de exemplo de arquétipo");
  });

  test("a opção impossível nunca avança — é o enunciado do teorema", () => {
    const antes = jogar(["gravar", "ler", "partir", "gravar2"]);
    const { jogo: depois, efeito } = agir(antes, "impossivel");
    assert.equal(efeito.tipo, "impossivel");
    assert.deepEqual(depois, antes, "o jogo não pode avançar com a resposta impossível");
    assert.match(efeito.texto, /partição/i);
  });

  test("todo passo alcançável tem narração, rótulo e explicação em cada opção", () => {
    const vistos = new Set();
    const fila = [novoJogo()];
    while (fila.length) {
      const j = fila.pop();
      const chave = j.fase + "/" + j.passo;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const p = passoAtual(j);
      assert.ok(p.narracao && p.narracao.length > 10, `${chave} sem narração`);
      assert.ok(p.rotulo, `${chave} sem rótulo de fase`);
      for (const o of p.opcoes) {
        assert.ok(o.efeito && o.efeito.texto.length > 10, `${chave}/${o.id} sem explicação`);
        fila.push(agir(j, o.id).jogo);
      }
    }
    assert.ok(vistos.has("fim/0"), "o fim é alcançável");
  });

  test("o placar reflete a escolha durante a partição", () => {
    const antesDaEscolha = jogar(["gravar", "ler", "partir", "gravar2"]);
    assert.deepEqual(letras(antesDaEscolha), { C: "em-jogo", A: "em-jogo", P: "ativa" });
    const escolheuC = agir(antesDaEscolha, "recusar").jogo;
    assert.equal(letras(escolheuC).A, "perdida");
    assert.equal(letras(escolheuC).C, "ok");
    const escolheuA = agir(antesDaEscolha, "responder-velho").jogo;
    assert.equal(letras(escolheuA).C, "perdida");
    assert.equal(letras(escolheuA).A, "ok");
  });

  test("veredito só existe no fim", () => {
    assert.equal(veredito(novoJogo(), base.bancos), null);
    assert.equal(veredito(jogar(["gravar", "ler", "partir", "gravar2"]), base.bancos), null);
  });
});
