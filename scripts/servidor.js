/* Servidor estático mínimo, sem dependência nenhuma.
   Existe porque o navegador bloqueia fetch() em file:// — abrir o
   index.html direto no Explorer não carrega a base de dados. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const PORTA = process.env.PORTA || 5173;
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

createServer(async (req, res) => {
  let caminho = decodeURIComponent(req.url.split("?")[0]);
  if (caminho === "/") caminho = "/src/web/index.html";
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
  console.log(`\n  seletor de banco  →  http://localhost:${PORTA}\n`);
});
