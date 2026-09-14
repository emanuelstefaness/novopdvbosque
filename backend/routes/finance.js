import { receipts, resolveRange as validatedRange } from '../reporting.js';
import { Router } from 'express';

export const financeRouter = Router();
const getDb = (req) => req.app.get('db');
financeRouter.use((req,res,next)=>{if(req.method==='GET'){try{req.range=validatedRange(req)}catch(e){return res.status(400).json({error:e.message})}}next()});

function addIsoDay(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function eachDateInclusive(from, to) {
  const out = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addIsoDay(cur, 1);
  }
  return out;
}

function mergeDailyRows(from, to, comandas, online, expenses, manualIn) {
  const map = new Map();
  for (const d of eachDateInclusive(from, to)) {
    map.set(d, {
      business_date: d,
      sales_comandas: 0,
      sales_online: 0,
      expenses: 0,
      income_manual: 0,
    });
  }
  for (const r of comandas) {
    const row = map.get(r.business_date);
    if (row) row.sales_comandas = Number(r.total || 0);
  }
  for (const r of online) {
    const row = map.get(r.business_date);
    if (row) row.sales_online = Number(r.total || 0);
  }
  for (const r of expenses) {
    const row = map.get(r.business_date);
    if (row) row.expenses = Number(r.total || 0);
  }
  for (const r of manualIn) {
    const row = map.get(r.business_date);
    if (row) row.income_manual = Number(r.total || 0);
  }
  return Array.from(map.values())
    .sort((a, b) => a.business_date.localeCompare(b.business_date))
    .map((row) => {
      const entradas = row.sales_comandas + row.sales_online + row.income_manual;
      const lucro = entradas - row.expenses;
      return { ...row, entradas_total: entradas, lucro };
    });
}

/** Série diária: vendas caixa + pedidos online entregues + lançamentos manuais − despesas */
financeRouter.get('/daily', (req, res) => {
  try {
    const db = getDb(req);
    const { from, to } = req.range;
    const rows=receipts(db,from,to);
    const group=channel=>{
      const map=new Map();for(const r of rows.filter(r=>r.channel===channel)) map.set(r.business_date,(map.get(r.business_date)||0)+Math.round(r.total*100));
      return [...map].map(([business_date,cents])=>({business_date,total:cents/100}));
    };
    const comandas=group('salon'),online=group('online');
    const expenses = db.prepare(`
      SELECT business_date, SUM(amount) as total
      FROM finance_expenses
      WHERE business_date BETWEEN ? AND ?
      GROUP BY business_date
    `).all(from, to);

    const manualIn = db.prepare(`
      SELECT business_date, SUM(amount) as total
      FROM finance_income_manual
      WHERE business_date BETWEEN ? AND ?
      GROUP BY business_date
    `).all(from, to);

    const daily = mergeDailyRows(from, to, comandas, online, expenses, manualIn);
    const totals = daily.reduce(
      (acc, r) => ({
        sales_comandas: acc.sales_comandas + r.sales_comandas,
        sales_online: acc.sales_online + r.sales_online,
        income_manual: acc.income_manual + r.income_manual,
        expenses: acc.expenses + r.expenses,
        entradas_total: acc.entradas_total + r.entradas_total,
        lucro: acc.lucro + r.lucro,
      }),
      { sales_comandas: 0, sales_online: 0, income_manual: 0, expenses: 0, entradas_total: 0, lucro: 0 }
    );

    res.json({
      from,
      to,
      business_day_note:
        'Dia operacional: das 01:00 até 00:59 do dia civil seguinte. Vendas após meia-noite entram no dia anterior até 01:00.',
      daily,
      totals,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao montar financeiro' });
  }
});

/** Lista lançamentos manuais (despesas e outras entradas) no período */
financeRouter.get('/entries', (req, res) => {
  const db = getDb(req);
  const { from, to } = req.range;
  const exp = db.prepare(`
    SELECT id, 'expense' as kind, business_date, description, amount, created_at
    FROM finance_expenses
    WHERE business_date BETWEEN ? AND ?
    ORDER BY business_date DESC, id DESC
  `).all(from, to);
  const inc = db.prepare(`
    SELECT id, 'income_manual' as kind, business_date, description, amount, created_at
    FROM finance_income_manual
    WHERE business_date BETWEEN ? AND ?
    ORDER BY business_date DESC, id DESC
  `).all(from, to);
  res.json({ expenses: exp, income_manual: inc });
});

financeRouter.post('/expenses', (req, res) => {
  const db = getDb(req);
  const { business_date, description, amount } = req.body || {};
  const bd = String(business_date || '').trim().slice(0, 10);
  const desc = String(description || '').trim();
  const val = Number(amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) return res.status(400).json({ error: 'business_date inválida (use YYYY-MM-DD).' });
  if (!desc) return res.status(400).json({ error: 'Descrição obrigatória.' });
  if (!Number.isFinite(val) || val <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
  const r = db.prepare(`
    INSERT INTO finance_expenses (business_date, description, amount)
    VALUES (?, ?, ?)
  `).run(bd, desc, val);
  res.status(201).json({ id: r.lastInsertRowid, business_date: bd, description: desc, amount: val });
});

financeRouter.post('/income-manual', (req, res) => {
  const db = getDb(req);
  const { business_date, description, amount } = req.body || {};
  const bd = String(business_date || '').trim().slice(0, 10);
  const desc = String(description || '').trim();
  const val = Number(amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) return res.status(400).json({ error: 'business_date inválida (use YYYY-MM-DD).' });
  if (!desc) return res.status(400).json({ error: 'Descrição obrigatória.' });
  if (!Number.isFinite(val) || val <= 0) return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
  const r = db.prepare(`
    INSERT INTO finance_income_manual (business_date, description, amount)
    VALUES (?, ?, ?)
  `).run(bd, desc, val);
  res.status(201).json({ id: r.lastInsertRowid, business_date: bd, description: desc, amount: val });
});

financeRouter.delete('/expenses/:id', (req, res) => {
  const db = getDb(req);
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM finance_expenses WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Lançamento não encontrado' });
  res.json({ ok: true });
});

financeRouter.delete('/income-manual/:id', (req, res) => {
  const db = getDb(req);
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM finance_income_manual WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Lançamento não encontrado' });
  res.json({ ok: true });
});
