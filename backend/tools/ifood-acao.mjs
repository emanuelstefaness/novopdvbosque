/**
 * Atalho para a homologação do iFood: executa no PDV, pela API real, a ação do pedido indicado.
 *
 *   node --env-file=.env tools/ifood-acao.mjs status    <numero do pedido iFood | id do pedido>
 *   node --env-file=.env tools/ifood-acao.mjs cancelar  <numero ou id>
 *   node --env-file=.env tools/ifood-acao.mjs despachar <numero ou id>
 *
 * Usa o mesmo caminho da tela "Pedidos online" (PATCH /api/orders/:id/status), então o PDV avisa o iFood
 * exatamente como faria pela interface.
 */
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [acao, alvo] = process.argv.slice(2);
if (!["status", "cancelar", "despachar"].includes(acao) || !alvo) {
  console.error("uso: ifood-acao.mjs status|cancelar|despachar <numero do pedido iFood ou id>");
  process.exit(2);
}
const base = process.env.PDV_URL || "http://localhost:3001";
const dbPath = process.env.PDV_DB_PATH || join(dirname(fileURLToPath(import.meta.url)), "..", "pdv_bosque.db");
const db = new Database(dbPath, { readonly: true });
const achar = () =>
  db.prepare("SELECT id, status, external_ref, external_id, tipo, entrega_por FROM orders WHERE origem = 'ifood' AND (external_ref = ? OR external_id = ? OR id = ?)")
    .get(String(alvo), String(alvo), Number(alvo) || -1);

let pedido = achar();
if (!pedido) { console.error(`pedido "${alvo}" não encontrado no PDV (ainda não chegou?)`); process.exit(1); }
console.log(`pedido iFood #${pedido.external_ref} (PDV #${pedido.id}) · status atual: ${pedido.status} · entrega: ${pedido.entrega_por || "?"}`);
if (acao === "status") process.exit(0);

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "caixa", password: process.env.PDV_CAIXA_PASSWORD }),
});
if (!login.ok) { console.error("login no PDV falhou:", login.status); process.exit(1); }
const { token } = await login.json();
const mudar = async (status, extra = {}) => {
  const r = await fetch(`${base}/api/orders/${pedido.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, ...extra }),
  });
  if (!r.ok) throw new Error(`${status}: HTTP ${r.status} ${await r.text()}`);
  console.log(`  → ${status} OK (${new Date().toLocaleTimeString("pt-BR")})`);
};
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

if (acao === "cancelar") {
  if (["cancelado", "entregue"].includes(pedido.status)) { console.log("já finalizado, nada a fazer"); process.exit(0); }
  await mudar("cancelado", { motivo_cancelamento: "Cancelado pelo restaurante" });
} else {
  const ordem = ["recebido", "em_producao", "pronto", "saiu_entrega"];
  const etapas = ["em_producao", "pronto", "saiu_entrega"];
  const atual = ordem.indexOf(pedido.status);
  if (atual < 0) { console.error(`status ${pedido.status} não permite despachar`); process.exit(1); }
  for (const e of etapas) {
    if (ordem.indexOf(e) <= atual) continue;
    await mudar(e);
    await pausa(2500);
  }
}
pedido = achar();
console.log(`status final no PDV: ${pedido.status}`);
