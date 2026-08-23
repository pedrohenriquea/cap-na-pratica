import { avaliar, sensibilidade, consolidar } from "../motor/motor.js";

const el = id => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const px = v => 14 + v * 80;
const py = v => 86 - v * 76;

let BASE, POLITICA;
const respostas = {};
const agregados = []; // decisões já guardadas para consolidação poliglota

/* ─────────── carga ─────────── */
try {
  const [b, p] = await Promise.all([
    fetch("../../dados/bancos.json").then(r => r.json()),
    fetch("../../dados/perguntas.json").then(r => r.json())
  ]);
  BASE = b; POLITICA = p;
} catch (err) {
  el("form").innerHTML =
    '<p class="erro">Não foi possível carregar a base. Rode <code>npm start</code> ' +
    'em vez de abrir o arquivo direto — o navegador bloqueia leitura local por <code>file://</code>.</p>';
  throw err;
}

el("versaoBase").textContent = "base " + BASE.versaoBase + " · política " + POLITICA.versaoPolitica;

/* ─────────── perguntas ─────────── */
POLITICA.perguntas.forEach((q, i) => {
  const bloco = document.createElement("fieldset");
  bloco.className = "q";

  // <legend> só rotula o grupo para leitor de tela se for filho direto do <fieldset>
  const cab = document.createElement("legend");
  cab.className = "q-cab";
  cab.innerHTML =
    '<span class="q-num">' + String(i + 1).padStart(2, "0") + "</span>" +
    '<span class="q-tit">' + q.titulo +
    (q.termo ? ' <span class="q-termo" title="o nome técnico disso, para procurar depois">' + q.termo + "</span>" : "") +
    "</span>";
  bloco.appendChild(cab);

  if (q.ajuda) {
    const aj = document.createElement("p");
    aj.className = "q-ajuda";
    aj.textContent = q.ajuda;
    bloco.appendChild(aj);
  }

  const lista = document.createElement("div");
  lista.className = "opcoes";
  q.opcoes.forEach(o => {
    const lab = document.createElement("label");
    lab.className = "opcao";
    const inp = document.createElement("input");
    inp.type = "radio"; inp.name = q.id; inp.value = o.id;
    inp.addEventListener("change", () => { respostas[q.id] = o.id; render(); });
    const sp = document.createElement("span");
    sp.textContent = o.texto;
    if (o.exemplo) {
      const s = document.createElement("small");
      s.textContent = o.exemplo;
      sp.appendChild(s);
    }
    lab.append(inp, sp);
    lista.appendChild(lab);
  });
  bloco.appendChild(lista);
  el("form").appendChild(bloco);
});

/* ─────────── plano PACELC ─────────── */
BASE.bancos.forEach(b => {
  const g = document.createElementNS(NS, "g");
  g.dataset.id = b.id;
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("class", "ponto");
  c.setAttribute("cx", px(b.caps.p)); c.setAttribute("cy", py(b.caps.e));
  c.setAttribute("r", "1.9");
  const t = document.createElementNS(NS, "text");
  t.setAttribute("class", "ponto-nome");
  t.setAttribute("x", px(b.caps.p) + 3); t.setAttribute("y", py(b.caps.e) + 1.2);
  t.textContent = b.nome.split(" /")[0];
  if (px(b.caps.p) > 70) { t.setAttribute("x", px(b.caps.p) - 3); t.setAttribute("text-anchor", "end"); }
  g.append(c, t);
  el("pontos").appendChild(g);
});

/* ─────────── render ─────────── */
function render() {
  const total = POLITICA.perguntas.length;
  const feitas = Object.keys(respostas).length;
  el("contador").textContent = feitas + " de " + total + " respondidas";
  el("barraFill").style.width = (feitas / total * 100) + "%";

  const res = avaliar(BASE, POLITICA, respostas);

  if (feitas > 0) {
    el("alvo").setAttribute("opacity", "1");
    el("alvo").setAttribute("transform",
      `translate(${px(res.alvo.p).toFixed(2)},${py(res.alvo.e).toFixed(2)})`);
  }
  const lider = res.viaveis[0]?.id;
  const bloqueados = new Set(res.inviaveis.map(x => x.id));
  el("pontos").querySelectorAll("g").forEach(g => {
    const fora = bloqueados.has(g.dataset.id);
    const c = g.querySelector("circle");
    c.setAttribute("fill", fora ? "var(--linha-forte)" : "var(--verdete)");
    c.setAttribute("r", g.dataset.id === lider && feitas === total ? "3.2" : "1.9");
    g.setAttribute("opacity", fora ? ".4" : "1");
  });

  if (feitas < total) { el("resultado").hidden = true; return; }
  el("resultado").hidden = false;
  pintar(res, sensibilidade(BASE, POLITICA, respostas));
}

function pintar(res, sens) {
  /* aviso de empate técnico — 4 pontos de diferença não é uma decisão */
  const aviso = el("avisoMargem");
  aviso.hidden = !sens.apertado;
  if (sens.apertado) {
    aviso.textContent =
      `${res.viaveis[0].nome} e ${res.viaveis[1].nome} ficaram a ${sens.margem} ` +
      `ponto${sens.margem === 1 ? "" : "s"} de distância. Isso é empate técnico: decida pelo que o time já sabe operar.`;
  }

  /* ranking com a trilha de cada ponto perdido */
  el("ranking").innerHTML = "";
  if (!res.viaveis.length) {
    el("ranking").innerHTML =
      '<p class="vazio">Suas respostas eliminaram todos os candidatos. Na prática isso quase sempre ' +
      'significa que o sistema tem <em>dois</em> conjuntos de requisitos diferentes — separe os agregados ' +
      'e rode a decisão para cada um.</p>';
  }
  res.viaveis.slice(0, 3).forEach((b, i) => {
    const art = document.createElement("article");
    art.className = "pos";
    const perdas = b.perdas.length
      ? b.perdas.map(p => `<li class="contra"><b>−${p.custo}</b> ${p.motivo}</li>`).join("")
      : '<li class="pleno">atende a tudo que você exigiu, sem ressalva de requisito</li>';
    const avisos = b.avisos.length
      ? '<ul class="avisos">' + b.avisos.map(a => "<li>" + a + "</li>").join("") + "</ul>"
      : "";
    art.innerHTML =
      `<div class="pos-rank">${i + 1}</div>` +
      `<div><h3>${b.nome} <span class="versao">${b.versaoAvaliada}</span></h3>` +
      `<p class="pos-fam">${b.familia}</p><ul class="pos-razoes">${perdas}</ul>${avisos}</div>` +
      `<div class="pos-med"><b>${b.pontos}</b>de 100</div>`;
    el("ranking").appendChild(art);
  });

  /* bloqueados: restrição dura, com motivo em texto */
  el("blocoFora").hidden = !res.inviaveis.length;
  el("listaFora").innerHTML = res.inviaveis.map(b =>
    `<li><b>${b.nome}</b> — ${b.bloqueios[0].motivo}` +
    (b.bloqueios.length > 1 ? ` <span class="mais">(+${b.bloqueios.length - 1})</span>` : "") + "</li>"
  ).join("");

  /* extensões sem justificativa */
  el("blocoDerivado").hidden = !res.naoJustificados.length;
  el("listaDerivado").innerHTML = res.naoJustificados.map(d =>
    `<li><b>${d.nome}</b> — ${d.motivo}</li>`).join("");

  /* sensibilidade: quais respostas seguram o resultado */
  el("blocoSens").hidden = !sens.criticas.length;
  el("listaSens").innerHTML = sens.criticas.map(c =>
    `<li><span class="sens-q">${c.titulo}</span><ul>` +
    c.viraria.map(v => "<li>" + v + "</li>").join("") + "</ul></li>").join("");
  el("sensRobusto").hidden = sens.criticas.length > 0;

  /* valor da informação */
  el("blocoInvestigar").hidden = !sens.investigar.length;
  el("listaInvestigar").innerHTML = sens.investigar.map(t => "<li>" + t + "</li>").join("");

  pintarConsolidacao();

  el("adr").textContent = montarADR(res, sens);
}

/* ─────────── consolidação poliglota ─────────── */
const nomeBanco = id => (BASE.bancos.find(b => b.id === id) || { nome: id }).nome;

function pintarAgregados() {
  el("painelAgregados").hidden = !agregados.length;
  el("listaAgregados").innerHTML = agregados.map(a => {
    const v = avaliar(BASE, POLITICA, a.respostas).viaveis[0];
    return "<li><b>" + a.nome + "</b> — " + (v ? v.nome + " (" + v.pontos + ")" : "nenhum viável") + "</li>";
  }).join("");
}

function pintarConsolidacao() {
  const bloco = el("consolidacao");
  bloco.hidden = !agregados.length;
  if (!agregados.length) return;
  const nomeAtual = el("nomeAgregado").value.trim() || "este agregado";
  const c = consolidar(BASE, POLITICA, [...agregados, { nome: nomeAtual, respostas }]);
  el("consolidacaoCorpo").innerHTML =
    "<ul>" + c.decisoes.map(d =>
      "<li><b>" + d.agregado + "</b> — " +
      (d.melhor ? nomeBanco(d.melhor) + " (" + d.pontos + ")" : "nenhum viável") + "</li>").join("") +
    '</ul><p class="veredito">' + c.recomendacao + "</p>";
}

/* ─────────── ADR ─────────── */
function montarADR(res, sens) {
  const L = [];
  const top = res.viaveis[0];
  L.push("# ADR-XXX — Escolha do banco de dados", "");
  L.push("- Status: proposto");
  L.push("- Data: " + new Date().toISOString().slice(0, 10));
  L.push("- Decisores: ");
  L.push(`- Gerado com base ${BASE.versaoBase} / política ${POLITICA.versaoPolitica}`, "");
  L.push("## Contexto", "", "Requisitos levantados para este agregado:", "");
  POLITICA.perguntas.forEach(q => {
    const o = q.opcoes.find(x => x.id === respostas[q.id]);
    if (o) L.push(`- **${q.titulo.replace(/\?$/, "")}:** ${o.texto}.`);
  });
  L.push("");
  L.push("Comportamento exigido (PACELC): se a rede entre as réplicas cair, " +
    (res.alvo.p >= .7 ? "**PC** — recusar a operação em vez de responder com dado incerto"
      : res.alvo.p <= .35 ? "**PA** — continuar respondendo, mesmo com risco de dado desatualizado"
      : "**intermediário** — depende da operação") +
    "; em operação normal, " +
    (res.alvo.e >= .7 ? "**EC** — priorizar dado correto sobre tempo de resposta"
      : res.alvo.e <= .35 ? "**EL** — priorizar tempo de resposta sobre dado correto"
      : "**intermediário**") + ".");
  L.push("", "## Decisão", "");
  if (!top) {
    L.push("Nenhum candidato atende a todos os requisitos declarados. Separar os agregados e decidir por agregado.");
  } else {
    L.push(`Adotar **${top.nome}** (${top.familia}, avaliado na versão ${top.versaoAvaliada}) — ${top.pontos}/100.`);
    if (sens.apertado) {
      L.push("", `> Empate técnico com ${res.viaveis[1].nome} (${sens.margem} ponto(s)). ` +
        "O critério de desempate foi a experiência do time, não a pontuação.");
    }
    if (top.avisos.length) {
      L.push("", "Ressalvas aceitas junto com a decisão:", "");
      top.avisos.forEach(a => L.push("- " + a));
    }
  }
  L.push("", "## Alternativas consideradas", "");
  res.viaveis.slice(1, 4).forEach(b => {
    const causa = b.perdas.length ? b.perdas.map(p => p.motivo).slice(0, 2).join("; ") : "sem falha de requisito";
    L.push(`- **${b.nome}** (${b.pontos}/100) — ${causa}.`);
  });
  res.inviaveis.forEach(b => L.push(`- **${b.nome}** — descartado: ${b.bloqueios[0].motivo}.`));
  res.naoJustificados.forEach(d => L.push(`- **${d.nome}** — não avaliado: ${d.motivo}.`));

  L.push("", "## Consequências", "");
  if (sens.criticas.length) {
    L.push("Esta decisão depende de poucas respostas. Se alguma destas mudar, a decisão muda:", "");
    sens.criticas.forEach(c => L.push(`- ${c.titulo}`));
    L.push("");
  }
  if (sens.investigar.length) {
    L.push("**Investigar antes de fechar** (respondido com incerteza e capaz de virar o resultado):", "");
    sens.investigar.forEach(t => L.push("- " + t));
    L.push("");
  }
  L.push("- A verificar: custo, requisitos regulatórios e de retenção, experiência do time.");
  L.push("- Revisitar quando: o volume mudar de ordem de grandeza, ou surgir padrão de acesso novo.");
  L.push("- Esta decisão vale para **um agregado**. Outros agregados podem exigir outro banco.");
  return L.join("\n");
}

/* ─────────── ações ─────────── */
el("btnCopiar").addEventListener("click", async e => {
  const txt = el("adr").textContent;
  try { await navigator.clipboard.writeText(txt); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = txt; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
  }
  e.target.textContent = "Copiado";
  setTimeout(() => { e.target.textContent = "Copiar ADR"; }, 1800);
});

function limpar() {
  el("form").reset();
  Object.keys(respostas).forEach(k => delete respostas[k]);
  el("alvo").setAttribute("opacity", "0");
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

el("btnReset").addEventListener("click", () => {
  agregados.length = 0;
  el("nomeAgregado").value = "";
  pintarAgregados();
  limpar();
});

el("btnGuardar").addEventListener("click", () => {
  const nome = el("nomeAgregado").value.trim() || "agregado " + (agregados.length + 1);
  agregados.push({ nome, respostas: { ...respostas } });
  el("nomeAgregado").value = "";
  pintarAgregados();
  limpar(); // guarda a decisão atual e reabre o questionário para o próximo agregado
});

render();
