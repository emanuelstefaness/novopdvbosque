/**
 * Encerra LOCALMENTE os pedidos do iFood que ainda estão em aberto no PDV (pedidos de teste da homologação),
 * sem chamar a API do iFood. Faz backup do banco antes.
 *
 *   node tools/limpar-pedidos-teste-ifood.mjs          # só mostra o que seria feito
 *   node tools/limpar-pedidos-teste-ifood.mjs --aplicar
 */
import Database from "better-sqlite3";
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aplicar = process.argv.includes("--aplicar");
const dbPath = process.env.PDV_DB_PATH || join(dirname(fileURLToPath(import.meta.url)), "..", "pdv_bosque.db");
const db = new Database(dbPath);
db.pragma("busy_timeout = 5000");

const abertos = db
  .prepare("SELECT id, status, external_ref, comanda_id, created_at FROM orders WHERE origem = 'ifood' AND status NOT IN ('entregue','cancelado')")
  .all();
console.log(`${abertos.length} pedido(s) iFood em aberto:`);
for (const o of abertos) console.log(`  PDV #${o.id} · iFood #${o.external_ref} · ${o.status} · ${o.created_at}`);
if (!aplicar) { console.log("\n(simulação) use --aplicar para encerrar."); process.exit(0); }
if (!abertos.length) process.exit(0);

const backup = dbPath.replace(/\.db$/, `.backup-antes-limpeza-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`backup: ${backup}`);

const run = db.transaction(() => {
  const upOrder = db.prepare(
    "UPDATE orders SET status = 'cancelado', motivo_cancelamento = 'Pedido de teste da homologação do iFood (encerrado localmente)', updated_at = datetime('now','localtime') WHERE id = ?",
  );
  const upPedidos = db.prepare("UPDATE pedidos SET status = 'cancelled', updated_at = datetime('now','localtime') WHERE comanda_id = ? AND status NOT IN ('cancelled','delivered')");
  const upSetor = db.prepare("UPDATE pedido_sector_status SET status = 'ready', updated_at = datetime('now','localtime') WHERE pedido_id IN (SELECT id FROM pedidos WHERE comanda_id = ?)");
  const upComanda = db.prepare("UPDATE comandas SET status = 'closed', closed_at = COALESCE(closed_at, datetime('now','localtime')), updated_at = datetime('now','localtime') WHERE id = ? AND origin_order_id IS NOT NULL");
  for (const o of abertos) {
    upOrder.run(o.id);
    if (o.comanda_id) { upPedidos.run(o.comanda_id); upSetor.run(o.comanda_id); upComanda.run(o.comanda_id); }
  }
});
run();
console.log(`${abertos.length} pedido(s) encerrado(s) localmente (o iFood não foi avisado).`);
