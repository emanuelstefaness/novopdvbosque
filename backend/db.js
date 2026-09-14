import Database from 'better-sqlite3';
import { initBilling } from './billing.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { BAR_CATEGORY_SLUGS } from './itemSector.js';

function sqlQuotedList(slugs) {
  return slugs.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(', ');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.PDV_DB_PATH || join(__dirname, 'pdv_bosque.db');

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000'); // até 5s de espera em escritas simultâneas (vários garçons + telas)

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      requires_meat_point INTEGER DEFAULT 0,
      is_grill INTEGER DEFAULT 0,
      is_kitchen INTEGER DEFAULT 0,
      is_bar INTEGER DEFAULT 0,
      is_side INTEGER DEFAULT 0,
      is_prato_feito INTEGER DEFAULT 0,
      is_arvoredo INTEGER DEFAULT 0,
      internal_only INTEGER DEFAULT 0,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS espetinhos_for_prato_feito (
      item_id INTEGER,
      espetinho_id INTEGER,
      PRIMARY KEY (item_id, espetinho_id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (espetinho_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS comandas (
      id INTEGER PRIMARY KEY,
      mesa TEXT,
      status TEXT DEFAULT 'closed',
      waiter_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      closed_at TEXT,
      people_count INTEGER DEFAULT 0,
      service_tax_percent REAL DEFAULT 0,
      couvert_per_person REAL DEFAULT 5,
      client_cpf TEXT
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comanda_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      observations TEXT,
      meat_point TEXT,
      caipirinha_base TEXT,
      caipirinha_picole INTEGER DEFAULT 0,
      dose_accompaniment TEXT,
      prato_feito_espetinho_id INTEGER,
      extra_caramelized_onion INTEGER DEFAULT 0,
      extra_hamburger INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      sector TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (comanda_id) REFERENCES comandas(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (prato_feito_espetinho_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS pedido_sector_status (
      pedido_id INTEGER,
      sector TEXT,
      status TEXT DEFAULT 'pending',
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (pedido_id, sector),
      FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
    );

    CREATE TABLE IF NOT EXISTS waiters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_comandas_status ON comandas(status);
    CREATE INDEX IF NOT EXISTS idx_pedidos_comanda ON pedidos(comanda_id);
    CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
    CREATE INDEX IF NOT EXISTS idx_pedidos_sector ON pedidos(sector);
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
  `);

  // —— Pedidos online (migração) ———
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK(tipo IN ('delivery','retirada')),
      status TEXT NOT NULL DEFAULT 'recebido' CHECK(status IN ('aguardando_pagamento','recebido','em_producao','pronto','saiu_entrega','entregue','cancelado')),
      cliente_nome TEXT NOT NULL,
      cliente_telefone TEXT NOT NULL,
      cliente_email TEXT,
      endereco_rua TEXT,
      endereco_numero TEXT,
      endereco_complemento TEXT,
      endereco_bairro TEXT,
      endereco_referencia TEXT,
      observacoes TEXT,
      valor_total REAL NOT NULL,
      comanda_id INTEGER,
      forma_pagamento TEXT,
      motivo_cancelamento TEXT,
      payment_status TEXT,
      mp_payment_id TEXT,
      pix_qr_code TEXT,
      pix_qr_code_base64 TEXT,
      pix_expira_em TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (comanda_id) REFERENCES comandas(id)
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      observations TEXT,
      prato_feito_espetinho_id INTEGER,
      extra_caramelized_onion INTEGER DEFAULT 0,
      extra_hamburger INTEGER DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_comanda ON orders(comanda_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `);

  // Migração: orders.status precisa aceitar 'aguardando_pagamento' (PIX automático),
  // mas SQLite não permite ALTER de CHECK — recria a tabela quando necessário.
  try {
    const ordersSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get();
    if (ordersSchema?.sql && !ordersSchema.sql.includes('aguardando_pagamento')) {
      db.pragma('foreign_keys = OFF');
      // Sem isso, "ALTER TABLE orders RENAME" reescreve o FOREIGN KEY de order_items
      // para apontar para "orders_old" (nome temporário), quebrando a referência depois
      // que a tabela "orders" nova é recriada com o mesmo nome original.
      db.pragma('legacy_alter_table = ON');
      const rebuild = db.transaction(() => {
        db.exec(`
          ALTER TABLE orders RENAME TO orders_old;
          CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL CHECK(tipo IN ('delivery','retirada')),
            status TEXT NOT NULL DEFAULT 'recebido' CHECK(status IN ('aguardando_pagamento','recebido','em_producao','pronto','saiu_entrega','entregue','cancelado')),
            cliente_nome TEXT NOT NULL,
            cliente_telefone TEXT NOT NULL,
            cliente_email TEXT,
            endereco_rua TEXT,
            endereco_numero TEXT,
            endereco_complemento TEXT,
            endereco_bairro TEXT,
            endereco_referencia TEXT,
            observacoes TEXT,
            valor_total REAL NOT NULL,
            comanda_id INTEGER,
            forma_pagamento TEXT,
            motivo_cancelamento TEXT,
            payment_status TEXT,
            mp_payment_id TEXT,
            pix_qr_code TEXT,
            pix_qr_code_base64 TEXT,
            pix_expira_em TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (comanda_id) REFERENCES comandas(id)
          );
          INSERT INTO orders (id, tipo, status, cliente_nome, cliente_telefone, cliente_email,
            endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_referencia,
            observacoes, valor_total, comanda_id, forma_pagamento, motivo_cancelamento, created_at, updated_at)
          SELECT id, tipo, status, cliente_nome, cliente_telefone, cliente_email,
            endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_referencia,
            observacoes, valor_total, comanda_id, forma_pagamento, motivo_cancelamento, created_at, updated_at
          FROM orders_old;
          DROP TABLE orders_old;
          CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
          CREATE INDEX IF NOT EXISTS idx_orders_comanda ON orders(comanda_id);
        `);
      });
      try {
        rebuild();
      } finally {
        db.pragma('legacy_alter_table = OFF');
        db.pragma('foreign_keys = ON');
      }
    }
  } catch (e) {
    console.error('Migração orders (aguardando_pagamento) falhou:', e.message);
  }

  const orderCols = [
    'forma_pagamento TEXT',
    'motivo_cancelamento TEXT',
    'payment_status TEXT',
    'mp_payment_id TEXT',
    'pix_qr_code TEXT',
    'pix_qr_code_base64 TEXT',
    'pix_expira_em TEXT'
  ];
  for (const col of orderCols) {
    try {
      db.exec(`ALTER TABLE orders ADD COLUMN ${col}`);
    } catch (e) {
      if (!e.message || !e.message.includes('duplicate column')) throw e;
    }
  }

  const orderItemCols = [
    'prato_feito_espetinho_id INTEGER',
    'extra_caramelized_onion INTEGER DEFAULT 0',
    'extra_hamburger INTEGER DEFAULT 0'
  ];
  for (const col of orderItemCols) {
    try {
      db.exec(`ALTER TABLE order_items ADD COLUMN ${col}`);
    } catch (e) {
      if (!e.message || !e.message.includes('duplicate column')) throw e;
    }
  }

  const cols = [
    'origin_order_id INTEGER',
    'tipo_online TEXT',
    'cliente_nome TEXT',
    'cliente_telefone TEXT',
    'cliente_email TEXT',
    'endereco_rua TEXT',
    'endereco_numero TEXT',
    'endereco_complemento TEXT',
    'endereco_bairro TEXT',
    'endereco_referencia TEXT'
  ];
  for (const col of cols) {
    const name = col.split(' ')[0];
    try {
      db.exec(`ALTER TABLE comandas ADD COLUMN ${col}`);
    } catch (e) {
      if (!e.message || !e.message.includes('duplicate column')) throw e;
    }
  }

  const pedidoAddonCols = ['extra_caramelized_onion INTEGER DEFAULT 0', 'extra_hamburger INTEGER DEFAULT 0'];
  for (const col of pedidoAddonCols) {
    try {
      db.exec(`ALTER TABLE pedidos ADD COLUMN ${col}`);
    } catch (e) {
      if (!e.message || !e.message.includes('duplicate column')) throw e;
    }
  }

  try {
    db.exec('ALTER TABLE items ADD COLUMN internal_only INTEGER DEFAULT 0');
  } catch (e) {
    if (!e.message || !e.message.includes('duplicate column')) throw e;
  }

  // Bar: fila só para categorias do bar; remove status bar de itens fora da lista
  const barSlugSql = sqlQuotedList(BAR_CATEGORY_SLUGS);
  try {
    db.exec(`
      DELETE FROM pedido_sector_status
      WHERE sector = 'bar' AND pedido_id IN (
        SELECT p.id FROM pedidos p
        JOIN items i ON i.id = p.item_id
        LEFT JOIN categories cat ON cat.id = i.category_id
        WHERE p.sector = 'bar' AND (cat.slug IS NULL OR cat.slug NOT IN (${barSlugSql}))
      );
      UPDATE pedidos SET sector = NULL, updated_at = datetime('now','localtime')
      WHERE sector = 'bar' AND id IN (
        SELECT p.id FROM pedidos p
        JOIN items i ON i.id = p.item_id
        LEFT JOIN categories cat ON cat.id = i.category_id
        WHERE cat.slug IS NULL OR cat.slug NOT IN (${barSlugSql})
      );
    `);
  } catch (e) {
    console.warn('Migração bar/categorias:', e.message);
  }

  // Pedidos antigos (sodas, bebidas, etc.) sem sector: envia para a fila do bar
  try {
    db.exec(`
      UPDATE pedidos SET sector = 'bar', updated_at = datetime('now','localtime')
      WHERE (sector IS NULL OR TRIM(COALESCE(sector, '')) = '')
      AND status NOT IN ('cancelled', 'delivered')
      AND item_id IN (
        SELECT i.id FROM items i
        JOIN categories c ON c.id = i.category_id
        WHERE i.is_bar = 1 AND c.slug IN (${barSlugSql})
      );
      INSERT OR IGNORE INTO pedido_sector_status (pedido_id, sector, status, updated_at)
      SELECT p.id, 'bar', 'pending', datetime('now','localtime')
      FROM pedidos p
      JOIN items i ON i.id = p.item_id
      JOIN categories c ON c.id = i.category_id
      WHERE p.sector = 'bar'
      AND p.status NOT IN ('cancelled', 'delivered')
      AND i.is_bar = 1
      AND c.slug IN (${barSlugSql})
      AND NOT EXISTS (SELECT 1 FROM pedido_sector_status s WHERE s.pedido_id = p.id AND s.sector = 'bar');
    `);
  } catch (e) {
    console.warn('Migração bar pedidos sem setor:', e.message);
  }

  // Salada virou item só em Acompanhamentos (remove categoria salada órfã)
  try {
    const salada = db.prepare('SELECT id FROM categories WHERE slug = ?').get('salada');
    const acomp = db.prepare('SELECT id FROM categories WHERE slug = ?').get('acompanhamentos');
    if (salada && acomp) {
      db.prepare('UPDATE items SET category_id = ? WHERE category_id = ?').run(acomp.id, salada.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(salada.id);
    }
  } catch (e) {
    console.warn('Migração salada → acompanhamentos:', e.message);
  }

  // Alinhar status com fechamento no caixa (evita "em andamento" no garçom após Pago)
  try {
    db.exec(`
      UPDATE comandas
      SET status = 'closed', mesa = NULL, updated_at = datetime('now','localtime')
      WHERE closed_at IS NOT NULL AND (status IS NULL OR status != 'closed')
    `);
  } catch (e) {
    console.warn('Migração comandas fechadas:', e.message);
  }

  // Doses avulsas no bar (Red Bull / Coca-Cola com preço próprio)
  try {
    const dosesCat = db.prepare('SELECT id FROM categories WHERE slug = ?').get('doses');
    if (dosesCat) {
      const ins = db.prepare(`
        INSERT INTO items (category_id, name, price, description, requires_meat_point, is_grill, is_kitchen, is_bar, is_side, is_prato_feito, is_arvoredo)
        VALUES (?, ?, ?, NULL, 0, 0, 0, 1, 0, 0, 0)
      `);
      const has = db.prepare('SELECT 1 FROM items WHERE category_id = ? AND name = ?').get(dosesCat.id, 'Red Bull');
      if (!has) ins.run(dosesCat.id, 'Red Bull', 18);
      const hasCoca = db.prepare('SELECT 1 FROM items WHERE category_id = ? AND name = ?').get(dosesCat.id, 'Coca-Cola 350ml');
      if (!hasCoca) ins.run(dosesCat.id, 'Coca-Cola 350ml', 8);
    }
  } catch (e) {
    console.warn('Migração doses Red Bull/Coca:', e.message);
  }

  try {
    db.exec(`
      UPDATE items SET is_side = 1
      WHERE name = 'Salada do Bosque'
      AND id IN (
        SELECT i.id FROM items i
        JOIN categories c ON c.id = i.category_id
        WHERE c.slug = 'acompanhamentos'
      )
      AND (is_side IS NULL OR is_side = 0)
    `);
  } catch (e) {
    console.warn('Migração Salada do Bosque is_side:', e.message);
  }

  // Lanche em destaque no pedir online
  try {
    const lanchesCat = db.prepare('SELECT id FROM categories WHERE slug = ?').get('lanches');
    if (lanchesCat) {
      const desc =
        'Baguete crocante recheada com coração de galinha suculento, pasta de alho Santa Massa, alface americana fresca e uma generosa camada de queijo gratinado.';
      const has = db.prepare('SELECT 1 FROM items WHERE name = ?').get('Churraspão de coração');
      if (!has) {
        db.prepare(`
          INSERT INTO items (category_id, name, price, description, requires_meat_point, is_grill, is_kitchen, is_bar, is_side, is_prato_feito, is_arvoredo)
          VALUES (?, 'Churraspão de coração', 36.90, ?, 0, 1, 1, 0, 0, 0, 0)
        `).run(lanchesCat.id, desc);
      }
    }
  } catch (e) {
    console.warn('Migração Churraspão de coração:', e.message);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS finance_income_manual (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_finance_exp_bd ON finance_expenses(business_date);
    CREATE INDEX IF NOT EXISTS idx_finance_inc_bd ON finance_income_manual(business_date);
  `);
  initBilling(db);
}
