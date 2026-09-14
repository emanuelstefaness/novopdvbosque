import { Router } from 'express';
import { billRows,calculateSelectionBill,cents,money,recordPayment,summaryFor,creditFor,recordCredit } from '../billing.js';
import { broadcastAll } from '../socket.js';
export const cashRouter=Router();
export function initCash(db){db.exec(`
CREATE TABLE IF NOT EXISTS cash_shifts(id INTEGER PRIMARY KEY,opened_at TEXT DEFAULT (datetime('now','localtime')),closed_at TEXT,operator TEXT,opening_cents INTEGER NOT NULL,counted_json TEXT,closing_json TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS cash_one_open ON cash_shifts((1)) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS cash_movements(id INTEGER PRIMARY KEY,shift_id INTEGER NOT NULL,kind TEXT NOT NULL,amount_cents INTEGER NOT NULL,reason TEXT NOT NULL,operator TEXT,created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS cash_payments(id INTEGER PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,comanda_id INTEGER,session_key TEXT,shift_id INTEGER,sale_id INTEGER,operator TEXT,amount_cents INTEGER,change_cents INTEGER,payload TEXT,created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS cash_tenders(id INTEGER PRIMARY KEY,payment_id INTEGER,method TEXT,amount_cents INTEGER);
`);}
const methods=['dinheiro','pix','debito','credito'];
function shiftSummary(db,s){if(!s)return null;const totals=Object.fromEntries(methods.map(m=>[m,0]));
 for(const r of db.prepare('SELECT t.method,SUM(t.amount_cents) amount FROM cash_tenders t JOIN cash_payments p ON p.id=t.payment_id WHERE p.shift_id=? GROUP BY t.method').all(s.id))totals[r.method]=r.amount;
 const movements=db.prepare('SELECT * FROM cash_movements WHERE shift_id=? ORDER BY id DESC').all(s.id);
 totals.dinheiro+=s.opening_cents+movements.reduce((n,m)=>n+(m.kind==='suprimento'?m.amount_cents:-m.amount_cents),0);
 return {...s,expected:totals,movements};}
cashRouter.get('/shift',(req,res)=>{const db=req.app.get('db');res.json({current:shiftSummary(db,db.prepare('SELECT * FROM cash_shifts WHERE closed_at IS NULL').get()),history:db.prepare('SELECT * FROM cash_shifts WHERE closed_at IS NOT NULL ORDER BY id DESC LIMIT 20').all()});});
cashRouter.post('/shift',(req,res)=>{const db=req.app.get('db'),n=cents(req.body.opening);if(!Number.isSafeInteger(n)||n<0)return res.status(400).json({error:'Informe um fundo de caixa válido.'});try{db.prepare('INSERT INTO cash_shifts(operator,opening_cents) VALUES(?,?)').run(req.user?.name||'Caixa',n);res.json({ok:true});}catch{res.status(409).json({error:'Já existe um turno aberto.'});}});
cashRouter.post('/movement',(req,res)=>{const db=req.app.get('db'),s=db.prepare('SELECT * FROM cash_shifts WHERE closed_at IS NULL').get(),n=cents(req.body.amount),kind=req.body.kind,reason=String(req.body.reason||'').trim();if(!s||!['suprimento','sangria'].includes(kind)||!Number.isSafeInteger(n)||n<=0||!reason)return res.status(400).json({error:'Abra o turno e informe valor e motivo.'});if(kind==='sangria'&&n>shiftSummary(db,s).expected.dinheiro)return res.status(400).json({error:'Sangria maior que o dinheiro disponível.'});db.prepare('INSERT INTO cash_movements(shift_id,kind,amount_cents,reason,operator) VALUES(?,?,?,?,?)').run(s.id,kind,n,reason,req.user?.name||'Caixa');res.json({ok:true});});
cashRouter.post('/shift/close',(req,res)=>{const db=req.app.get('db');try{const result=db.transaction(()=>{const s=db.prepare('SELECT * FROM cash_shifts WHERE closed_at IS NULL').get();if(!s)throw Error('Nenhum turno aberto.');const counted={};for(const m of methods){const n=cents(req.body.counted?.[m]);if(!Number.isSafeInteger(n)||n<0)throw Error('Confira os quatro meios de pagamento.');counted[m]=n;}const summary=shiftSummary(db,s);const difference=Object.fromEntries(methods.map(m=>[m,counted[m]-summary.expected[m]]));db.prepare("UPDATE cash_shifts SET closed_at=datetime('now','localtime'),counted_json=?,closing_json=? WHERE id=?").run(JSON.stringify(counted),JSON.stringify({expected:summary.expected,difference}),s.id);return {difference};})();res.json(result);}catch(e){res.status(400).json({error:e.message});}});
cashRouter.post('/receive',(req,res)=>{const db=req.app.get('db');try{const result=db.transaction(()=>{
 const key=String(req.body.request_key||'');if(key.length<12)throw Error('Identificador de recebimento inválido.');
 const replay=db.prepare('SELECT * FROM cash_payments WHERE request_key=?').get(key);if(replay){if(replay.payload!==JSON.stringify(req.body))throw Error('Identificador já usado para outro recebimento.');return {ok:true,replayed:true,change:money(replay.change_cents)};}
 const c=db.prepare('SELECT * FROM comandas WHERE id=?').get(Number(req.body.comanda_id));if(!c||c.status==='closed'||c.origin_order_id||c.production_number)throw Error('Comanda indisponível para receber.');
 const available=billRows(db,c.id);let rows=available;
 if(req.body.selection){const seen=new Set();rows=req.body.selection.map(s=>{const p=available.find(p=>p.id===Number(s.id)),q=Number(s.quantity);if(!p||seen.has(p.id)||!Number.isInteger(q)||q<1||q>p.quantity)throw Error('Seleção de unidades inválida ou já recebida.');seen.add(p.id);return {...p,quantity:q};});}
 if(!rows.length)throw Error('Nenhum item pendente.');const credit=creditFor(db,c.session_key).total;
 const due=cents(calculateSelectionBill(c,rows,available).total)-credit;
 const isAdvance=req.body.amount!==undefined,total=isAdvance?cents(req.body.amount):due;
 if(isAdvance&&(!Number.isSafeInteger(total)||total<=0||total>=due||rows.length!==available.length||rows.some(r=>available.find(p=>p.id===r.id)?.quantity!==r.quantity)))throw Error('Adiantamento deve ser menor que o saldo, sem seleção parcial de itens.');
 if(total!==cents(req.body.expected_total))throw Error('A conta mudou. Atualize os valores antes de receber.');
 const tenders=req.body.tenders;if(!Array.isArray(tenders)||!tenders.length)throw Error('Informe o pagamento.');
 const normalized=tenders.map(t=>{const amount=cents(t.amount);if(!methods.includes(t.method)||!Number.isSafeInteger(amount)||amount<=0)throw Error('Meio ou valor de pagamento inválido.');return {method:t.method,amount};});
 const supplied=normalized.reduce((n,t)=>n+t.amount,0),change=supplied-total,cash=normalized.filter(t=>t.method==='dinheiro').reduce((n,t)=>n+t.amount,0);if(change<0||change>cash)throw Error('Complete o valor. Troco só pode sair do dinheiro recebido.');
 const shift=db.prepare('SELECT id FROM cash_shifts WHERE closed_at IS NULL').get();
 const sale=isAdvance?recordCredit(db,c,total):recordPayment(db,c,rows);const payment=db.prepare('INSERT INTO cash_payments(request_key,comanda_id,session_key,shift_id,sale_id,operator,amount_cents,change_cents,payload) VALUES(?,?,?,?,?,?,?,?,?)').run(key,c.id,c.session_key,shift?.id||null,sale,req.user?.name||'Caixa',total,change,JSON.stringify(req.body)).lastInsertRowid;
 let rest=change;for(const t of normalized){const discount=t.method==='dinheiro'?Math.min(rest,t.amount):0;rest-=discount;db.prepare('INSERT INTO cash_tenders(payment_id,method,amount_cents) VALUES(?,?,?)').run(payment,t.method,t.amount-discount);}
 const summary=summaryFor(db,c.id);if(!summary.pedidos.length)db.prepare("UPDATE comandas SET status='closed',mesa=NULL,closed_at=datetime('now','localtime') WHERE id=?").run(c.id);
 return {ok:true,change:money(change),remaining:summary.total,closed:!summary.pedidos.length,summary};
 })();broadcastAll('comandas',{});res.json(result);}catch(e){res.status(400).json({error:e.message});}});
