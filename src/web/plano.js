/**
 * Layout do plano PACELC — puro, sem DOM, para ser testável no Node.
 *
 * Rotular cada ponto com o nome por extenso não cabe: metade dos bancos
 * vive no mesmo canto do plano (PC/EC) e os nomes se sobrepõem. Cada ponto
 * recebe um número; a lista numerada abaixo do gráfico faz o resto.
 * O número é posicionado por busca gulosa para nunca cobrir outro número
 * nem outro ponto — e há teste garantindo isso quando a base crescer.
 */
export const px = v => 14 + v * 80;
export const py = v => 86 - v * 76;

const RAIO = 1.9;        // raio do ponto no viewBox 100×100
const LARG_DIGITO = 1.9; // avanço aproximado do IBM Plex Mono a 3.2px

export function posicionarNumeros(bancos) {
  const caixas = [];
  const colide = a => caixas.some(b => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1);
  const pontos = bancos.map((b, i) => ({
    id: b.id, nome: b.nome, indice: i + 1, cx: px(b.caps.p), cy: py(b.caps.e)
  }));
  // os próprios pontos são obstáculos: número não pode cobrir ponto
  for (const p of pontos)
    caixas.push({ x1: p.cx - RAIO - 0.4, y1: p.cy - RAIO - 0.4, x2: p.cx + RAIO + 0.4, y2: p.cy + RAIO + 0.4 });

  const posicionados = new Map();
  // de cima para baixo, para o resultado ser estável entre execuções
  for (const p of [...pontos].sort((a, b) => a.cy - b.cy || a.cx - b.cx)) {
    const larg = String(p.indice).length * LARG_DIGITO;
    let melhor = null;
    busca:
    for (const dy of [0, 3, -3, 6, -6]) {
      for (const dx of [2.8, 5, 7.5]) {
        // no lado direito do plano, preferir o número à esquerda do ponto
        for (const anchor of p.cx > 54 ? ["end", "start"] : ["start", "end"]) {
          const x = anchor === "start" ? p.cx + dx : p.cx - dx;
          const y = p.cy + 1 + dy;
          const x1 = anchor === "start" ? x : x - larg;
          const caixa = { x1, y1: y - 2.4, x2: x1 + larg, y2: y + 0.6 };
          if (caixa.x1 < 1 || caixa.x2 > 99 || caixa.y1 < 10.5 || caixa.y2 > 92) continue;
          if (colide(caixa)) continue;
          melhor = { x, y, anchor, caixa };
          break busca;
        }
      }
    }
    if (!melhor) { // não deve ocorrer com a base atual; o teste acusa se ocorrer
      const x = p.cx + 2.8, y = p.cy + 1;
      melhor = { x, y, anchor: "start", caixa: { x1: x, y1: y - 2.4, x2: x + larg, y2: y + 0.6 } };
    }
    caixas.push(melhor.caixa);
    posicionados.set(p.id, { ...p, ...melhor });
  }
  return pontos.map(p => posicionados.get(p.id));
}
