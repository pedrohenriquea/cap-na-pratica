import { novoJogo, passoAtual, agir, letras, veredito } from "./capSimulacao.js";

const el = id => document.getElementById(id);
const espera = ms => new Promise(r => setTimeout(r, ms));
const SEM_MOVIMENTO = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TEM_OFFSET = !SEM_MOVIMENTO && CSS.supports("offset-path", 'path("M0,0 L1,1")');

let jogo = novoJogo();
let ocupado = false;
let BANCOS = null; // só o veredito precisa da base; o jogo roda sem ela

fetch("../../dados/bancos.json").then(r => r.json()).then(b => { BANCOS = b.bancos; }).catch(() => {});

/* ─────────── primitivas de animação da cena ─────────── */

/** Faz o pacote percorrer uma linha da cena. Sem suporte a offset-path, só espera. */
function pacote(caminhoId, cor, { reverso = false, ateMetade = false } = {}) {
  if (!TEM_OFFSET) return espera(SEM_MOVIMENTO ? 120 : 400);
  return new Promise(resolve => {
    const p = el("pacote");
    p.setAttribute("class", "pacote " + cor);
    p.style.offsetPath = `path('${el(caminhoId).getAttribute("d")}')`;
    p.style.animationDirection = reverso ? "reverse" : "normal";
    p.getBoundingClientRect(); // força reflow para a animação reiniciar
    p.classList.add(ateMetade ? "anda-meio" : "anda");
    let feito = false;
    const fim = () => {
      if (feito) return;
      feito = true;
      p.classList.remove("anda", "anda-meio");
      p.removeEventListener("animationend", fim);
      resolve();
    };
    p.addEventListener("animationend", fim);
    setTimeout(fim, 1400);
  });
}

function reanimar(id, classe) {
  const n = el(id);
  n.classList.remove(classe);
  n.getBoundingClientRect();
  n.classList.add(classe);
}
const pulso = id => reanimar(id, "pulso");
const treme = id => reanimar(id, "treme");
const flash = id => reanimar(id, "flash");
const valor = (id, txt) => { el(id).textContent = txt; };

/* ─────────── efeitos: o que cada ação faz na cena ─────────── */
const EFEITOS = {
  async "gravou-replicou"() {
    await pacote("setaGrava", "azul");
    valor("valorA", "R$ 100"); pulso("noA");
    await pacote("linhaRepl", "azul");
    valor("valorB", "R$ 100"); pulso("noB");
  },
  async "leu-certo"() {
    await pacote("setaLe", "verde");
    pulso("noB");
    await pacote("setaLe", "verde", { reverso: true });
    pulso("gApp");
  },
  async particao() {
    el("cena").classList.add("partida");
    await espera(450);
  },
  async "gravou-sem-replica"() {
    await pacote("setaGrava", "azul");
    valor("valorA", "R$ 250"); pulso("noA");
    await pacote("linhaRepl", "azul", { ateMetade: true });
    treme("corte");
  },
  async "escolha-A"() {
    await pacote("setaLe", "verde");
    pulso("noB");
    await pacote("setaLe", "verde", { reverso: true });
    el("chipB").classList.add("velho");
    pulso("gApp");
  },
  async "escolha-C"() {
    await pacote("setaLe", "verde");
    flash("recusa");
    await espera(500);
  },
  async impossivel() {
    treme("noB");
    await espera(450);
  },
  async religou() {
    el("cena").classList.remove("partida");
    await espera(300);
    await pacote("linhaRepl", "azul");
    valor("valorB", "R$ 250"); el("chipB").classList.remove("velho"); pulso("noB");
  },
  async "else-C"() {
    await pacote("setaGrava", "azul");
    pulso("noA");
    await pacote("linhaRepl", "azul");
    pulso("noB");
    await espera(120);
    pulso("gApp"); // só agora a aplicação recebe o "salvo"
  },
  async "else-L"() {
    await pacote("setaGrava", "azul");
    pulso("noA"); pulso("gApp"); // "salvo" imediato; a réplica corre atrás
    await pacote("linhaRepl", "azul");
    pulso("noB");
  }
};

/* ─────────── ciclo do jogo ─────────── */
async function executar(id) {
  if (ocupado) return;
  ocupado = true;
  el("acoes").querySelectorAll("button").forEach(b => { b.disabled = true; });

  const { jogo: proximo, efeito } = agir(jogo, id);
  await (EFEITOS[efeito.tipo] || (() => espera(100)))();
  jogo = proximo;

  const h = el("historico");
  h.hidden = false;
  h.textContent = efeito.texto;
  h.classList.toggle("erro", efeito.tipo === "impossivel");

  ocupado = false;
  pintar();
}

function pintar() {
  const passo = passoAtual(jogo);
  el("faseChip").textContent = passo.rotulo;

  const estado = letras(jogo);
  for (const l of ["C", "A", "P"]) el("letra" + l).dataset.estado = estado[l];

  el("narrador").textContent = passo.narracao;

  const caixa = el("acoes");
  caixa.innerHTML = "";
  for (const o of passo.opcoes) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = passo.escolha ? "escolha" : "acao";
    b.textContent = o.texto;
    if (o.dica) {
      const s = document.createElement("small");
      s.textContent = o.dica;
      b.appendChild(s);
    }
    b.addEventListener("click", () => executar(o.id));
    caixa.appendChild(b);
  }

  if (jogo.fase === "fim") pintarVeredito();
}

function pintarVeredito() {
  const v = veredito(jogo, BANCOS || []);
  const cx = el("veredito");
  cx.hidden = false;
  const vizinhos = v.vizinhos.length
    ? '<p class="ver-viz-tit">Os bancos que vivem nesse canto</p><ul>' +
      v.vizinhos.map(b => `<li><b>${b.nome}</b><span>${b.familia}</span></li>`).join("") + "</ul>"
    : '<p class="ver-viz-tit">Rode com <code>npm start</code> para ver os bancos desse canto</p>';
  cx.innerHTML =
    `<p class="ver-quadrante">${v.quadrante}</p>` +
    `<p>Seu sistema ${v.descricao}. No plano PACELC do questionário, é o canto p≈${v.p} / e≈${v.e}.</p>` +
    vizinhos +
    '<div class="ver-acoes">' +
    '<a class="acao" href="./index.html">Responder o questionário →</a>' +
    '<button class="acao fantasma" id="btnDeNovo" type="button">Jogar de novo</button>' +
    "</div>";
  el("btnDeNovo").addEventListener("click", () => location.reload());
}

pintar();
