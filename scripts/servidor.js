/* Servidor estático mínimo, sem dependência nenhuma.
   Existe porque o navegador bloqueia fetch() em file:// — abrir o
   index.html direto no Explorer não carrega a base de dados. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, não .pathname: no Windows o pathname vem como /E:/... e o
// join produz um caminho inválido — todo request respondia 404.
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PORTA = process.env.PORTA || 5173;
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

createServer(async (req, res) => {
  const caminho = decodeURIComponent(req.url.split("?")[0]);
  // redirect, não rewrite: servir o conteúdo em "/" deixaria o navegador na
  // raiz, e aí ./app.js e ../../dados/*.json resolvem para caminhos que não
  // existem — a página abre estática, sem pergunta nenhuma.
  if (caminho === "/") {
    res.writeHead(302, { Location: "/src/web/index.html" });
    res.end();
    return;
  }
  const alvo = join(RAIZ, normalize(caminho).replace(/^(\.\.[/\\])+/, ""));
  try {
    const dados = await readFile(alvo);
    res.writeHead(200, { "Content-Type": TIPOS[extname(alvo)] || "application/octet-stream" });
    res.end(dados);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("não encontrado: " + caminho);
  }
}).listen(PORTA, () => {
  console.log(`\n  CAP na prática  →  http://localhost:${PORTA}\n`);
});
