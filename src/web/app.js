import { avaliar, sensibilidade, consolidar, porQueVenceu, expandirPolitica, robustez } from "../motor/motor.js";
import { posicionarNumeros, px, py } from "./plano.js";

const el = id => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";

let BASE, POLITICA;
const respostas = {};
const agregados = []; // decisões já guardadas para consolidação poliglota

/* ─────────── carga ─────────── */
try {
  const [b, p] = await Promise.all([
    fetch("../../dados/bancos.json").then(r => r.json()),
    fetch("../../dados/perguntas.json").then(r => r.json())
  ]);
  BASE = b; POLITICA = expandirPolitica(b, p); // a pergunta do incumbente lista os bancos da base
} catch (err) {
  el("form").innerHTML =
    '<p class="erro">Não foi possível carregar a base. Rode <code>npm start</code> ' +
    'em vez de abrir o arquivo direto — o navegador bloqueia leitura local por <code>file://</code>.</p>';
  throw err;
}

el("versaoBase").textContent = "base " + BASE.versaoBase + " · política " + POLITICA.versaoPolitica;

/* ─────────── perguntas, agrupadas por tópico do CAP/PACELC ─────────── */
const grupos = new Map((POLITICA.grupos || []).map(g => [g.id, g]));
let grupoAtual = null;
POLITICA.perguntas.forEach((q, i) => {
  if (q.grupo && q.grupo !== grupoAtual && grupos.has(q.grupo)) {
    grupoAtual = q.grupo;
    const g = grupos.get(q.grupo);
    const cab = document.createElement("div");
    cab.className = "grupo-cab";
    cab.innerHTML =
      '<span class="grupo-selo">' + g.selo + "</span>" +
      '<div><h2 class="grupo-tit">' + g.titulo + "</h2>" +
      '<p class="grupo-desc">' + g.descricao + "</p></div>";
    el("form").appendChild(cab);
  }

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
  lista.className = "opcoes" + (q.opcoes.length > 5 ? " compacta" : "");
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
posicionarNumeros(BASE.bancos).forEach(r => {
  const g = document.createElementNS(NS, "g");
  g.dataset.id = r.id;
  const c = document.createElementNS(NS, "circle");
  const banco = BASE.bancos.find(b => b.id === r.id);
  c.setAttribute("class", "ponto" + (banco.noUnico ? " no-unico" : ""));
  c.setAttribute("cx", r.cx); c.setAttribute("cy", r.cy);
  c.setAttribute("r", "1.9");
  const t = document.createElementNS(NS, "text");
  t.setAttribute("class", "ponto-nome");
  t.setAttribute("x", r.x); t.setAttribute("y", r.y);
  if (r.anchor === "end") t.setAttribute("text-anchor", "end");
  t.textContent = r.indice;
  g.append(c, t);
  el("pontos").appendChild(g);

  const li = document.createElement("li");
  li.dataset.id = r.id;
  const i = document.createElement("i");
  i.textContent = r.indice;
  li.append(i, r.nome);
  el("mapaBancos").appendChild(li);
});

/* ─────────── render ─────────── */
function render() {
  const total = POLITICA.perguntas.length;
  const feitas = Object.keys(respostas).length;
  el("contador").textContent = feitas + " de " + total + " respondidas";
  history.replaceState(null, "", linkAtual());
  const pct = (feitas / total * 100) + "%";
  el("barraFill").style.width = pct;   // barra fixa no topo da página
  el("barraLocal").style.width = pct;  // barra ao lado do contador

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
    const cor = fora ? "var(--ponto-fora)" : "var(--ponto-vivo)";
    // nó único: o eixo P não se aplica de verdade (fica no lado PC por
    // convenção) — o ponto é vazado para não parecer medida
    if (c.classList.contains("no-unico")) {
      c.setAttribute("fill", "var(--plano)"); c.setAttribute("stroke", cor); c.setAttribute("stroke-width", "0.9");
    } else {
      c.setAttribute("fill", cor);
    }
    c.setAttribute("r", g.dataset.id === lider && feitas === total ? "3.2" : "1.9");
    g.setAttribute("opacity", fora ? ".4" : "1");
  });
  el("mapaBancos").querySelectorAll("li").forEach(li => {
    li.classList.toggle("fora-plano", bloqueados.has(li.dataset.id));
    li.classList.toggle("lider-plano", li.dataset.id === lider && feitas === total);
  });

  if (feitas < total) { el("resultado").hidden = true; return; }
  el("resultado").hidden = false;
  pintar(res, sensibilidade(BASE, POLITICA, respostas), robustez(BASE, POLITICA, respostas));
}

const FAIXAS = { forte: "forte candidato", viavel: "viável", ressalvas: "com ressalvas" };

function pintar(res, sens, rob) {
  /* aviso de empate técnico — 4 pontos de diferença não é uma decisão */
  const aviso = el("avisoMargem");
  aviso.hidden = !sens.apertado;
  if (sens.apertado) {
    aviso.textContent =
      `${res.viaveis[0].nome} e ${res.viaveis[1].nome} ficaram a ${sens.margem} ` +
      `ponto${sens.margem === 1 ? "" : "s"} de distância. Isso é empate técnico: decida pelo que o time já sabe operar.`;
  }

  /* robustez: os pesos são opinião; o vencedor sobrevive a ±20% em cada um? */
  const r = el("robustez");
  r.hidden = !res.viaveis.length;
  r.classList.toggle("fragil", !rob.robusto);
  r.innerHTML = rob.robusto
    ? `<b>Resultado robusto.</b> O vencedor não muda em nenhuma das ${rob.total} variações de ±20% nos pesos da política — está apoiado em estrutura, não em coincidência numérica.`
    : `<b>Resultado frágil.</b> Com ${rob.viradas.map(v => `<i>${v.rotulo}</i> venceria ${v.vencedor}`).join("; ")}. ` +
      "A ordem aqui depende de opinião sobre pesos: trate como empate e decida pelo time.";

  /* ranking com a trilha de cada ponto perdido */
  el("ranking").innerHTML = "";
  if (!res.viaveis.length) {
    el("ranking").innerHTML =
      '<p class="vazio">Suas respostas eliminaram todos os candidatos. Na prática isso quase sempre ' +
      'significa que o sistema tem <em>dois</em> conjuntos de requisitos diferentes — separe os agregados ' +
      'e rode a decisão para cada um.</p>';
  }
  const razoes = porQueVenceu(POLITICA, res);
  res.viaveis.slice(0, 3).forEach((b, i) => {
    const art = document.createElement("article");
    art.className = "pos";
    const pros = i === 0
      ? razoes.map(r => r.tipo === "exigencia"
          ? `<li class="pro">cumpre «${r.titulo.replace(/\?$/, "")}» — exigência que eliminou ${r.eliminados.join(", ")}</li>`
          : `<li class="pro">evita a perda do ${r.sobre}: «${r.motivo}» (−${r.custo} para ele)</li>`).join("")
      : "";
    const perdas = b.perdas.length
      ? b.perdas.map(p => `<li class="contra"><b>−${p.custo}</b> ${p.motivo}</li>`).join("")
      : '<li class="pleno">atende a tudo que você exigiu, sem ressalva de requisito</li>';
    const avisos = b.avisos.length
      ? '<ul class="avisos">' + b.avisos.map(a => "<li>" + a + "</li>").join("") + "</ul>"
      : "";
    art.innerHTML =
      `<div class="pos-rank">${i + 1}</div>` +
      `<div><h3>${b.nome} <span class="versao">${b.versaoAvaliada}</span> <span class="faixa faixa-${b.faixa}">${FAIXAS[b.faixa]}</span></h3>` +
      `<p class="pos-fam">${b.familia}</p><ul class="pos-razoes">${pros}${perdas}</ul>${avisos}</div>` +
      `<div class="pos-med"><b>${b.pontos}</b>de 100<span class="medidor"><i style="width:${b.pontos}%"></i></span></div>`;
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

  el("adr").textContent = montarADR(res, sens, rob);
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
function montarADR(res, sens, rob) {
  const L = [];
  const top = res.viaveis[0];
  L.push("# ADR-XXX — Escolha do banco de dados", "");
  L.push("- Status: proposto");
  L.push("- Data: " + new Date().toISOString().slice(0, 10));
  L.push("- Decisores: ");
  L.push(`- Gerado com base ${BASE.versaoBase} / política ${POLITICA.versaoPolitica}`);
  L.push(`- Reproduzir: ${linkAtual()}`, "");
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
    L.push(`Adotar **${top.nome}** (${top.familia}, avaliado na versão ${top.versaoAvaliada}) — ` +
      `${FAIXAS[top.faixa]}, ${top.pontos}/100. A pontuação é ordem, não medida.`);
    L.push("", rob.robusto
      ? `Robustez: o vencedor não muda em nenhuma das ${rob.total} variações de ±20% nos pesos da política.`
      : `Robustez: **frágil** — ${rob.viradas.map(v => `com ${v.rotulo} venceria ${v.vencedor}`).join("; ")}. ` +
        "A ordem depende de opinião sobre pesos; a decisão foi tratada como empate técnico.");
    const razoes = porQueVenceu(POLITICA, res);
    if (razoes.length) {
      L.push("", "O que pesou a favor:", "");
      razoes.forEach(r => L.push(r.tipo === "exigencia"
        ? `- Cumpre «${r.titulo.replace(/\?$/, "")}», exigência que eliminou ${r.eliminados.join(", ")}.`
        : `- Evita a perda do ${r.sobre}: ${r.motivo}.`));
    }
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

/* ─────────── link reproduzível: as respostas vivem na URL ───────────
   Uma decisão que não dá para reabrir não dá para revisar. O ADR carrega o
   link, e quem abrir vê exatamente as mesmas respostas e o mesmo resultado
   (para a mesma versão da base e da política). */
function linkAtual() {
  const r = Object.entries(respostas).map(([q, o]) => q + ":" + o).join(",");
  return location.origin + location.pathname + (r ? "?r=" + r : "");
}
const daUrl = new URLSearchParams(location.search).get("r");
if (daUrl) {
  for (const par of daUrl.split(",")) {
    const [q, o] = par.split(":");
    const inp = el("form").querySelector(`input[name="${CSS.escape(q)}"][value="${CSS.escape(o)}"]`);
    if (inp) { inp.checked = true; respostas[q] = o; }
  }
}

render();
