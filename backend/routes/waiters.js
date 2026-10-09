import { Router } from 'express';

export const waitersRouter = Router();
const getDb = (req) => req.app.get('db');

waitersRouter.get('/', (req, res) => {
  const db = getDb(req);
  res.json(db.prepare('SELECT id, name FROM waiters ORDER BY name').all());
});

// Retorna ou cria garçom pelo nome (para identificação na sessão)
waitersRouter.post('/by-name', (req, res) => {
  try {
    const db = getDb(req);
    const { name } = req.body || {};
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) return res.status(400).json({ error: 'Nome é obrigatório' });
    let w = db.prepare('SELECT id, name FROM waiters WHERE name = ?').get(trimmed);
    if (!w) {
      const info = db.prepare('INSERT INTO waiters (name) VALUES (?)').run(trimmed);
      w = { id: info.lastInsertRowid, name: trimmed };
    }
    res.json(w);
  } catch (err) {
    console.error('Erro waiters by-name:', err);
    res.status(500).json({ error: err.message });
  }
});
