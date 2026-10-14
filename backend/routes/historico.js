import { Router } from 'express';

/**
 * Histórico de comandas: tudo o que já foi cobrado, consultável a qualquer momento.
 * Só leitura. A fonte é a tabela `sales` (uma linha por recebimento), agrupada pela sessão da comanda,
 * porque o número da comanda (1–200) é reutilizado e não identifica sozinho uma conta.
 */
export const historicoRouter = Router();
const getDb = (req) => req.app.get('db');
const reais = (c) => (Number(c) || 0) / 100;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function hoje(db) {
  return db.prepare("SELECT date('now','localtime') AS d").get().d;
}

/** Cliente e observação da sessão: da comanda atual, ou do retrato guardado quando o número foi reutilizado. */
function dadosDaSessao(db, sessionKey) {
  // O mesmo número pode ter a linha da comanda e retratos fechados (produção pendente): usa a que está em aberto, ou a que tem cliente.
  const linhas = db.prepare('SELECT * FROM comandas WHERE session_key = ?').all(sessionKey);
  const emAberto = linhas.find((l) => String(l.status).toLowerCase() !== 'closed');
  if (emAberto) return { comanda: emAberto, aberta: true };
  const comNome = linhas.find((l) => l.cliente_nome);
  if (comNome || linhas.length) return { comanda: comNome || linhas[0], aberta: false };
  const h = db.prepare('SELECT comanda_json FROM comanda_history WHERE session_key = ? ORDER BY id DESC LIMIT 1').get(sessionKey);
  if (h) {
    try {
      return { comanda: JSON.parse(h.comanda_json), aberta: false };
    } catch {
      /* retrato ilegível: segue sem os dados extras */
    }
  }
  return { comanda: null, aberta: false };
}

function situacaoDe(info) {
  if (!info.comanda) return 'fechada';
  const st = String(info.comanda.status || '').toLowerCase();
  if (st === 'guardada') return 'guardada';
  return info.aberta ? 'aberta' : 'fechada';
}

historicoRouter.get('/', (req, res) => {
  const db = getDb(req);
  const to = DATA.test(String(req.query.to || '')) ? String(req.query.to) : hoje(db);
  const from = DATA.test(String(req.query.from || ''))
    ? String(req.query.from)
    : db.prepare("SELECT date(?, '-6 day') AS d").get(to).d;
  const q = String(req.query.q || '').trim().toLowerCase();
  const limite = Math.min(500, Math.max(1, Number(req.query.limit) || 200));

  const rows = db
    .prepare(
      `SELECT session_key,
              MIN(comanda_id) AS comanda_id,
              MAX(mesa) AS mesa,
              MAX(waiter_name) AS garcom,
              MAX(people_count) AS pessoas,
              MIN(paid_at) AS primeiro_pagamento,
              MAX(paid_at) AS ultimo_pagamento,
              SUM(total_cents) AS total_cents,
              SUM(CASE WHEN is_credit = 1 THEN 0 ELSE 1 END) AS recebimentos
         FROM sales
        WHERE substr(paid_at, 1, 10) BETWEEN ? AND ? AND origin_order_id IS NULL
        GROUP BY session_key
        ORDER BY MAX(paid_at) DESC
        LIMIT 1000`,
    )
    .all(from, to);

  let lista = rows.map((r) => {
    const info = dadosDaSessao(db, r.session_key);
    return {
      session_key: r.session_key,
      comanda_id: r.comanda_id,
      mesa: r.mesa || info.comanda?.mesa || null,
      garcom: r.garcom,
      pessoas: r.pessoas || 0,
      cliente_nome: info.comanda?.cliente_nome || null,
      situacao: situacaoDe(info),
      primeiro_pagamento: r.primeiro_pagamento,
      ultimo_pagamento: r.ultimo_pagamento,
      total: reais(r.total_cents),
      recebimentos: r.recebimentos,
    };
  });

  if (q) {
    lista = lista.filter((r) =>
      [r.comanda_id, r.mesa, r.garcom, r.cliente_nome].some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }
  const total = lista.reduce((s, r) => s + r.total, 0);
  res.json({ de: from, ate: to, quantidade: lista.length, total, comandas: lista.slice(0, limite) });
});

historicoRouter.get('/:sessionKey', (req, res) => {
  const db = getDb(req);
  const key = String(req.params.sessionKey);
  // Sessões agrupadas (juntar comandas) pagam na sessão destino; as de origem ficam ligadas a ela.
  const sessoes = [
    key,
    ...db.prepare('SELECT source_session FROM billing_session_links WHERE target_session = ?').all(key).map((r) => r.source_session),
  ];
  const marcas = sessoes.map(() => '?').join(',');
  const vendas = db
    .prepare(`SELECT * FROM sales WHERE session_key IN (${marcas}) ORDER BY paid_at, id`)
    .all(...sessoes);
  if (!vendas.length) return res.status(404).json({ error: 'Comanda não encontrada no histórico.' });

  const itens = new Map();
  const buscaItens = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id');
  const pagamentos = [];
  const buscaPagamento = db.prepare('SELECT * FROM cash_payments WHERE sale_id = ?');
  const buscaMeios = db.prepare('SELECT method, amount_cents FROM cash_tenders WHERE payment_id = ?');
  for (const v of vendas) {
    for (const it of buscaItens.all(v.id)) {
      const chave = `${it.name}|${it.unit_cents}|${it.is_couvert}`;
      const atual = itens.get(chave) || { nome: it.name, categoria: it.category_name, quantidade: 0, unitario: reais(it.unit_cents), couvert: !!it.is_couvert };
      atual.quantidade += it.quantity;
      itens.set(chave, atual);
    }
    const pg = buscaPagamento.get(v.id);
    pagamentos.push({
      pago_em: v.paid_at,
      valor: reais(v.total_cents),
      adiantamento: !!v.is_credit,
      operador: pg?.operator || null,
      troco: pg ? reais(pg.change_cents) : 0,
      meios: pg ? buscaMeios.all(pg.id).map((m) => ({ meio: m.method, valor: reais(m.amount_cents) })) : [],
    });
  }

  const info = dadosDaSessao(db, key);
  const soma = (campo) => reais(vendas.reduce((s, v) => s + (v[campo] || 0), 0));
  res.json({
    session_key: key,
    comanda_id: vendas[0].comanda_id,
    mesa: vendas[0].mesa || info.comanda?.mesa || null,
    garcom: vendas[0].waiter_name,
    pessoas: Math.max(...vendas.map((v) => v.people_count || 0)),
    cliente_nome: info.comanda?.cliente_nome || null,
    cliente_telefone: info.comanda?.cliente_telefone || null,
    observacao: info.comanda?.observation || null,
    situacao: situacaoDe(info),
    subtotal: soma('subtotal_cents'),
    couvert: soma('couvert_cents'),
    servico: soma('service_cents'),
    total: soma('total_cents'),
    primeiro_pagamento: vendas[0].paid_at,
    ultimo_pagamento: vendas[vendas.length - 1].paid_at,
    itens: [...itens.values()],
    pagamentos,
  });
});
