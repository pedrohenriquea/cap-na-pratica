/**
 * Simulação jogável do teorema CAP — lógica pura, sem DOM, no mesmo espírito
 * do motor: o roteiro é dado, a interface só desenha.
 *
 * A cena é o desenho clássico: a aplicação grava num nó primário (A) e lê de
 * uma réplica (B), com uma linha de replicação entre eles. O jogo força as
 * duas escolhas do PACELC na ordem em que elas doem — durante a partição
 * (A ou C) e no dia a dia (L ou C).
 *
 * A opção "responder o valor novo" existe de propósito e nunca avança:
 * é o enunciado do teorema virando botão.
 */

export function novoJogo() {
  return { fase: "normal", passo: 0, escolhaParticao: null, escolhaElse: null };
}

const ROTEIRO = {
  "normal/0": {
    rotulo: "Fase 1 · Dia normal",
    narracao: "Este é o desenho clássico: a aplicação grava no Nó A e lê do Nó B — uma réplica em outra cidade, mantida pela linha de replicação. Comece gravando um saldo.",
    opcoes: [{
      id: "gravar", texto: "Gravar saldo = R$ 100",
      efeito: { tipo: "gravou-replicou", texto: "O Nó A confirmou e a replicação copiou o valor: os dois nós enxergam R$ 100." },
      proximo: { fase: "normal", passo: 1 }
    }]
  },
  "normal/1": {
    rotulo: "Fase 1 · Dia normal",
    narracao: "O valor está nos dois nós. Confira lendo na outra ponta.",
    opcoes: [{
      id: "ler", texto: "Ler no Nó B",
      efeito: { tipo: "leu-certo", texto: "R$ 100 — o valor certo. Com a rede saudável, consistência e disponibilidade convivem: o teorema ainda não cobrou nada." },
      proximo: { fase: "normal", passo: 2 }
    }]
  },
  "normal/2": {
    rotulo: "Fase 1 · Dia normal",
    narracao: "Agora o dia que o teorema realmente descreve: o cabo entre os nós falha.",
    opcoes: [{
      id: "partir", texto: "⚡ Partir a rede",
      efeito: { tipo: "particao", texto: "A rede partiu. Os dois nós estão vivos e atendendo — só não se enxergam. A partir de agora, cada resposta é uma escolha." },
      proximo: { fase: "particao", passo: 0 }
    }]
  },
  "particao/0": {
    rotulo: "Fase 2 · Partição",
    narracao: "Com a rede partida, chega uma gravação no Nó A.",
    opcoes: [{
      id: "gravar2", texto: "Gravar saldo = R$ 250",
      efeito: { tipo: "gravou-sem-replica", texto: "O A aceitou R$ 250 — mas a replicação não atravessa a partição. O B continua com R$ 100, sem nenhum jeito de saber que envelheceu." },
      proximo: { fase: "particao", passo: 1 }
    }]
  },
  "particao/1": {
    rotulo: "Fase 2 · Partição",
    narracao: "Chegou uma leitura no Nó B: “qual é o saldo?”. Você decide o que ele responde.",
    escolha: true,
    opcoes: [
      {
        id: "responder-velho", texto: "Responder o que tem: R$ 100", dica: "segue no ar — mas o valor está velho",
        efeito: { tipo: "escolha-A", texto: "Você escolheu disponibilidade (A). O usuário recebeu R$ 100 enquanto o saldo real é R$ 250: o sistema não parou, mas respondeu errado com convicção. É o lado AP — Cassandra e DynamoDB nascem dele." },
        proximo: { fase: "particao", passo: 2, escolhaParticao: "A" }
      },
      {
        id: "recusar", texto: "Recusar: erro até a rede voltar", dica: "não mente — mas fica fora do ar",
        efeito: { tipo: "escolha-C", texto: "Você escolheu consistência (C). O usuário viu um erro, mas ninguém recebeu número errado. É o lado CP — CockroachDB e os sistemas de quórum preferem parar a errar." },
        proximo: { fase: "particao", passo: 2, escolhaParticao: "C" }
      },
      {
        id: "impossivel", texto: "Responder o valor novo: R$ 250", dica: "o melhor dos dois mundos?",
        efeito: { tipo: "impossivel", texto: "Impossível — e essa é a prova do teorema. O R$ 250 só existe do outro lado da partição; para o B, é como se nunca tivesse acontecido. Nenhum software faz a informação atravessar um cabo cortado. Escolha de novo." }
      }
    ]
  },
  "particao/2": {
    rotulo: "Fase 2 · Partição",
    narracao: "A escolha ficou registrada no placar. Partição é rara e acaba — religue a rede.",
    opcoes: [{
      id: "religar", texto: "Religar a rede",
      efeito: { tipo: "religou", texto: "A replicação alcançou o B: R$ 250 nos dois. Mas o teorema tem uma extensão que cobra todo dia, mesmo com a rede perfeita — o else do PACELC." },
      proximo: { fase: "else", passo: 0 }
    }]
  },
  "else/0": {
    rotulo: "Fase 3 · O dia a dia (PACELC)",
    narracao: "Sem falha nenhuma, toda gravação ainda decide: esperar o B confirmar antes de dizer “salvo”, ou responder já e replicar por trás?",
    escolha: true,
    opcoes: [
      {
        id: "sincrona", texto: "Esperar o B confirmar", dica: "toda leitura sai atual; cada gravação paga a ida até o B",
        efeito: { tipo: "else-C", texto: "Consistência no dia a dia (EC): a gravação fica mais lenta, e qualquer leitura — em qualquer nó — devolve o valor atual." },
        proximo: { fase: "fim", passo: 0, escolhaElse: "C" }
      },
      {
        id: "assincrona", texto: "Confirmar na hora, replicar por trás", dica: "rápido — mas quem ler no B logo depois pode ver o valor antigo",
        efeito: { tipo: "else-L", texto: "Latência no dia a dia (EL): resposta imediata, e a leitura na réplica pode atrasar alguns instantes." },
        proximo: { fase: "fim", passo: 0, escolhaElse: "L" }
      }
    ]
  },
  "fim/0": {
    rotulo: "Veredito",
    narracao: "Fim de jogo: você fez as duas escolhas que o PACELC mede. Nenhuma é errada — cada uma serve a um sistema diferente.",
    opcoes: []
  }
};

export function passoAtual(jogo) {
  const p = ROTEIRO[jogo.fase + "/" + jogo.passo];
  if (!p) throw new Error(`passo desconhecido: ${jogo.fase}/${jogo.passo}`);
  return p;
}

export function opcoes(jogo) {
  return passoAtual(jogo).opcoes;
}

/** Executa uma ação. A opção impossível devolve o efeito sem avançar o jogo. */
export function agir(jogo, id) {
  const o = opcoes(jogo).find(x => x.id === id);
  if (!o) throw new Error(`ação inválida em ${jogo.fase}/${jogo.passo}: ${id}`);
  if (!o.proximo) return { jogo, efeito: o.efeito };
  const prox = { ...jogo, fase: o.proximo.fase, passo: o.proximo.passo };
  if (o.proximo.escolhaParticao) prox.escolhaParticao = o.proximo.escolhaParticao;
  if (o.proximo.escolhaElse) prox.escolhaElse = o.proximo.escolhaElse;
  return { jogo: prox, efeito: o.efeito };
}

/**
 * Placar das três letras. "em-jogo" é o momento da escolha; depois dela,
 * a letra abandonada fica "perdida" enquanto a partição durar. Com a rede
 * de volta, as duas letras voltam — a escolha fica no veredito.
 */
export function letras(jogo) {
  if (jogo.fase === "normal")
    return { C: "ok", A: "ok", P: "dormente" };
  if (jogo.fase === "particao") {
    if (!jogo.escolhaParticao) return { C: "em-jogo", A: "em-jogo", P: "ativa" };
    return {
      C: jogo.escolhaParticao === "C" ? "ok" : "perdida",
      A: jogo.escolhaParticao === "A" ? "ok" : "perdida",
      P: "ativa"
    };
  }
  return { C: "ok", A: "ok", P: "dormente" };
}

/**
 * As duas escolhas viram um ponto no plano PACELC e os bancos reais mais
 * próximos desse canto. Extensões (derivaDe) não servem de exemplo de
 * arquétipo — o Timescale não explica um quadrante melhor que o Postgres.
 */
export function veredito(jogo, bancos) {
  if (jogo.fase !== "fim") return null;
  const p = jogo.escolhaParticao === "C" ? 0.9 : 0.15;
  const e = jogo.escolhaElse === "C" ? 0.85 : 0.15;
  const quadrante = (p >= 0.5 ? "PC" : "PA") + "/" + (e >= 0.5 ? "EC" : "EL");
  const descricoes = {
    "PA/EL": "na falha segue no ar, e no dia a dia prioriza velocidade",
    "PA/EC": "na falha segue no ar, mas no dia a dia cobra leitura atual",
    "PC/EL": "na falha prefere parar, mas no dia a dia prioriza velocidade",
    "PC/EC": "na falha prefere parar, e no dia a dia cobra leitura atual"
  };
  const vizinhos = bancos
    .filter(b => !b.derivaDe)
    .map(b => ({ id: b.id, nome: b.nome, familia: b.familia, dist: +Math.hypot(b.caps.p - p, b.caps.e - e).toFixed(3) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);
  return { quadrante, p, e, descricao: descricoes[quadrante], vizinhos };
}
