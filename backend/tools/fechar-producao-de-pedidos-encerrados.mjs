/**
 * Fecha, na fila de produção, os itens de pedidos online que já foram cancelados ou entregues
 * (sobras de antes da correção). Faz backup antes.
 *
 *   node tools/fechar-producao-de-pedidos-encerrados.mjs            # só mostra
 *   node tools/fechar-producao-de-pedidos-encerrados.mjs --aplicar
 */
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aplicar = process.argv.includes("--aplicar");
const dbPath = process.env.PDV_DB_PATH || join(dirname(fileURLToPath(import.meta.url)), "..", "pdv_bosque.db");
const db = new Database(dbPath);
db.pragma("busy_timeout = 5000");

const sobras = db
  .prepare(`
    SELECT o.id, o.origem, o.external_ref, o.status, COUNT(p.id) AS itens
    FROM orders o JOIN pedidos p ON p.comanda_id = o.comanda_id
    WHERE o.status IN ('cancelado','entregue') AND p.status NOT IN ('cancelled','delivered')
    GROUP BY o.id
  `)
  .all();
const total = sobras.reduce((s, r) => s + r.itens, 0);
console.log(`${sobras.length} pedido(s) encerrado(s) com itens ainda na produção (${total} item(ns)):`);
for (const r of sobras) console.log(`  PDV #${r.id} · ${r.origem || "proprio"}${r.external_ref ? " #" + r.external_ref : ""} · ${r.status} · ${r.itens} item(ns)`);
if (!aplicar) { console.log("\n(simulação) use --aplicar para fechar."); process.exit(0); }
if (!sobras.length) process.exit(0);

const backup = dbPath.replace(/\.db$/, `.backup-antes-fechar-producao-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`backup: ${backup}`);

db.transaction(() => {
  const upP = db.prepare("UPDATE pedidos SET status = ?, updated_at = datetime('now','localtime') WHERE comanda_id = (SELECT comanda_id FROM orders WHERE id = ?) AND status NOT IN ('cancelled','delivered')");
  const upS = db.prepare("UPDATE pedido_sector_status SET status = 'ready', updated_at = datetime('now','localtime') WHERE pedido_id IN (SELECT id FROM pedidos WHERE comanda_id = (SELECT comanda_id FROM orders WHERE id = ?)) AND status != 'ready'");
  for (const r of sobras) {
    upP.run(r.status === "cancelado" ? "cancelled" : "delivered", r.id);
    upS.run(r.id);
  }
})();
console.log(`${total} item(ns) fechado(s) na produção.`);
