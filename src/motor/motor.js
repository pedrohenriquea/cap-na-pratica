/**
 * Motor de decisão — função pura, sem I/O.
 * Recebe (base, politica, respostas) e devolve o resultado completo,
 * incluindo a trilha de auditoria de cada ponto perdido.
 *
 * Regra de ouro: ninguém GANHA ponto. Todo mundo começa em 100 e perde
 * por requisito não atendido. É o que impede o generalista medíocre de
 * vencer o especialista por acúmulo de bônus em perguntas irrelevantes.
 */

export function comparaEscala(escala, valorBanco, valorMinimo) {
  const a = escala.indexOf(valorBanco);
  const b = escala.indexOf(valorMinimo);
  if (a < 0 || b < 0) throw new Error(`valor fora da escala: ${valorBanco} / ${valorMinimo}`);
  return a - b; // >= 0 significa que atende
}

export function atende(req, caps, escalas) {
  const valor = caps[req.cap];
  if (valor === undefined) throw new Error(`capacidade desconhecida: ${req.cap}`);
  switch (req.op) {
    case "min": return comparaEscala(escalas[req.cap], valor, req.valor) >= 0;
    case "eq":  return valor === req.valor;
    case "em":  return req.valor.includes(valor);
    default: throw new Error(`operador desconhecido: ${req.op}`);
  }
}

/** Avalia um único conjunto de respostas. */
export function avaliar(base, politica, respostas) {
  const { escalas, bancos } = base;
  const { severidades, pesoDistanciaPacelc, perguntas } = politica;

  // 1. alvo PACELC derivado das respostas
  const alvo = { p: 0.5, e: 0.5 };
  for (const q of perguntas) {
    const o = q.opcoes.find(x => x.id === respostas[q.id]);
    if (o && o.pacelc) Object.assign(alvo, o.pacelc);
  }

  // 2. candidatos derivados (extensões) só entram se a necessidade que os
  //    justifica existir. Sem isso, o superconjunto vence o banco base sempre.
  const naoJustificados = [];
  const elegiveis = bancos.filter(b => {
    if (!b.justificaSe) return true;
    const resposta = respostas[b.justificaSe.pergunta];
    if (!resposta || b.justificaSe.opcoes.includes(resposta)) return true;
    naoJustificados.push({
      id: b.id, nome: b.nome, derivaDe: b.derivaDe,
      motivo: b.justificaSe.motivoSemJustificativa
    });
    return false;
  });

  // 3. para cada banco: restrições duras primeiro, depois penalidades
  const avaliados = elegiveis.map(b => {
    const bloqueios = [];
    const perdas = [];
    let pontos = 100;

    for (const q of perguntas) {
      const escolha = respostas[q.id];
      if (!escolha) continue;
      const o = q.opcoes.find(x => x.id === escolha);
      if (!o) throw new Error(`resposta inválida para ${q.id}: ${escolha}`);
      for (const req of o.requisitos || []) {
        if (atende(req, b.caps, escalas)) continue;
        const registro = {
          pergunta: q.id, resposta: o.id, capacidade: req.cap,
          exigido: req.valor, tem: b.caps[req.cap], motivo: req.motivo,
          ressalva: (b.ressalvas || {})[req.cap] || null
        };
        if (req.sev === "bloqueante") { bloqueios.push(registro); continue; }
        const custo = severidades[req.sev];
        if (typeof custo !== "number") throw new Error(`severidade desconhecida: ${req.sev}`);
        pontos -= custo;
        perdas.push({ ...registro, severidade: req.sev, custo });
      }
    }

    // 4. distância PACELC: contínua, não categórica
    const dist = Math.hypot(b.caps.p - alvo.p, b.caps.e - alvo.e);
    const custoPacelc = Math.round(dist * pesoDistanciaPacelc);
    if (custoPacelc > 0) {
      pontos -= custoPacelc;
      perdas.push({
        pergunta: "pacelc", capacidade: "comportamento sob falha e latência",
        exigido: `p≈${alvo.p} / e≈${alvo.e}`, tem: `p=${b.caps.p} / e=${b.caps.e}`,
        motivo: dist > 0.45
          ? "por padrão se comporta de forma bem diferente do que você pediu"
          : "pequeno ajuste de configuração para chegar ao comportamento pedido",
        severidade: "pacelc", custo: custoPacelc
      });
    }

    // ressalvas relevantes mesmo quando o requisito É atendido
    const avisos = [];
    for (const q of perguntas) {
      const o = q.opcoes.find(x => x.id === respostas[q.id]);
      if (!o) continue;
      for (const req of o.requisitos || []) {
        const r = (b.ressalvas || {})[req.cap];
        if (r && atende(req, b.caps, escalas) && !avisos.includes(r)) avisos.push(r);
      }
    }
    if ((b.ressalvas || {}).papel) avisos.unshift(b.ressalvas.papel);

    return {
      id: b.id, nome: b.nome, familia: b.familia, versaoAvaliada: b.versaoAvaliada,
      viavel: bloqueios.length === 0,
      pontos: Math.max(0, pontos),
      distanciaPacelc: +dist.toFixed(3),
      bloqueios, perdas, avisos
    };
  });

  const viaveis = avaliados.filter(a => a.viavel).sort((a, b) => b.pontos - a.pontos);
  const inviaveis = avaliados.filter(a => !a.viavel)
    .sort((a, b) => a.bloqueios.length - b.bloqueios.length);

  return { alvo, viaveis, inviaveis, naoJustificados };
}

/**
 * Explicação positiva do vencedor. avaliar() só registra o que cada banco
 * perdeu; aqui a mesma conta vira argumento a favor: as exigências que o
 * vencedor cumpre e que eliminaram os outros, e as perdas do vice que ele
 * não tem. Não concede ponto nenhum — só traduz o resultado.
 */
export function porQueVenceu(politica, resultado) {
  const vencedor = resultado.viaveis[0];
  if (!vencedor) return [];
  const razoes = [];

  // exigências bloqueantes que derrubaram candidatos — o vencedor, por ser
  // viável, cumpre todas elas
  const porPergunta = new Map();
  for (const b of resultado.inviaveis)
    for (const blq of b.bloqueios) {
      if (!porPergunta.has(blq.pergunta)) porPergunta.set(blq.pergunta, new Set());
      porPergunta.get(blq.pergunta).add(b.nome);
    }
  const titulos = Object.fromEntries(politica.perguntas.map(q => [q.id, q.titulo]));
  [...porPergunta.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 3)
    .forEach(([pergunta, nomes]) =>
      razoes.push({ tipo: "exigencia", titulo: titulos[pergunta] || pergunta, eliminados: [...nomes] }));

  // perdas do segundo colocado que o vencedor não compartilha
  const vice = resultado.viaveis[1];
  if (vice) {
    const chave = p => p.pergunta + "|" + p.capacidade;
    const doVencedor = new Set(vencedor.perdas.map(chave));
    vice.perdas
      .filter(p => !doVencedor.has(chave(p)))
      .sort((a, b) => b.custo - a.custo)
      .slice(0, 2)
      .forEach(p => razoes.push({ tipo: "vantagem", sobre: vice.nome, motivo: p.motivo, custo: p.custo }));
  }
  return razoes;
}

/**
 * Análise de sensibilidade: para cada pergunta, troca a resposta por cada
 * alternativa e verifica se o vencedor muda. Responde "qual resposta minha
 * está realmente segurando esse resultado".
 */
export function sensibilidade(base, politica, respostas) {
  const atual = avaliar(base, politica, respostas);
  const vencedor = atual.viaveis[0] ? atual.viaveis[0].id : null;
  const criticas = [];

  for (const q of politica.perguntas) {
    if (!respostas[q.id]) continue;
    const alternativos = new Set();
    for (const o of q.opcoes) {
      if (o.id === respostas[q.id]) continue;
      const r = avaliar(base, politica, { ...respostas, [q.id]: o.id });
      const novo = r.viaveis[0] ? r.viaveis[0].id : null;
      if (novo !== vencedor) alternativos.add(`${o.texto} → ${novo ? r.viaveis[0].nome : "nenhum candidato viável"}`);
    }
    if (alternativos.size) {
      criticas.push({ pergunta: q.id, titulo: q.titulo, viraria: [...alternativos] });
    }
  }

  // margem sobre o segundo colocado: resultado apertado merece aviso
  const margem = atual.viaveis.length > 1
    ? atual.viaveis[0].pontos - atual.viaveis[1].pontos : null;

  // valor da informação: perguntas respondidas com incerteza E que são críticas
  const incertas = politica.perguntas
    .filter(q => {
      const o = q.opcoes.find(x => x.id === respostas[q.id]);
      return o && o.incerta;
    })
    .map(q => q.id);
  const investigar = criticas
    .filter(c => incertas.includes(c.pergunta))
    .map(c => c.titulo);

  return {
    vencedor, margem,
    apertado: margem !== null && margem <= 10,
    criticas, investigar
  };
}

/** Consolidação poliglota: vale mesmo ter dois bancos, ou um serve aos dois? */
export function consolidar(base, politica, agregados) {
  // agregados: [{ nome, respostas }]
  const decisoes = agregados.map(a => {
    const r = avaliar(base, politica, a.respostas);
    return { agregado: a.nome, viaveis: r.viaveis };
  });

  // um banco que seja viável para todos os agregados evita persistência poliglota
  const comuns = decisoes.reduce((acc, d) => {
    const ids = new Set(d.viaveis.map(v => v.id));
    return acc === null ? ids : new Set([...acc].filter(x => ids.has(x)));
  }, null) || new Set();

  const somaPontos = id => decisoes.reduce((s, d) => {
    const v = d.viaveis.find(x => x.id === id);
    return s + (v ? v.pontos : 0);
  }, 0);

  const unico = [...comuns].sort((a, b) => somaPontos(b) - somaPontos(a))[0] || null;
  const nomeDe = id => (base.bancos.find(b => b.id === id) || { nome: id }).nome;
  const melhorPorAgregado = decisoes.map(d => ({
    agregado: d.agregado,
    melhor: d.viaveis[0] ? d.viaveis[0].id : null,
    pontos: d.viaveis[0] ? d.viaveis[0].pontos : 0
  }));

  const ganhoEspecializando = melhorPorAgregado.reduce((s, m) => s + m.pontos, 0) - (unico ? somaPontos(unico) : 0);

  return {
    decisoes: melhorPorAgregado,
    candidatoUnico: unico,
    ganhoEspecializando,
    recomendacao: !unico
      ? "nenhum banco atende a todos os agregados: persistência poliglota é obrigatória aqui"
      : ganhoEspecializando <= 15
        ? `use ${nomeDe(unico)} para tudo: especializar renderia pouco e custa mais um sistema para operar`
        : `especializar vale a pena: o ganho supera o custo de operar mais de um banco`
  };
}
