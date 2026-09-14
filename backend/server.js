import { authRouter,authorize,sessionFor,announceAccess,rateLimit } from './auth.js';
import express from 'express';
import os from 'os';
import { createServer } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import cors from 'cors';
import { initDb, db } from './db.js';
import { setIo } from './socket.js';
import { comandasRouter, mergeComandasHandler, clearComandaHandler } from './routes/comandas.js';
import { pedidosRouter } from './routes/pedidos.js';
import { menuRouter } from './routes/menu.js';
import { reportsRouter } from './routes/reports.js';
import { printRouter } from './routes/print.js';
import { waitersRouter } from './routes/waiters.js';
import { publicRouter } from './routes/public.js';
import { ordersRouter } from './routes/orders.js';
import { financeRouter } from './routes/finance.js';
import { cashRouter,initCash } from './routes/cash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
initDb();
initCash(db);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});
setIo(io);

const corsOrigin = process.env.CORS_ORIGIN && String(process.env.CORS_ORIGIN).trim()
  ? String(process.env.CORS_ORIGIN).trim()
  : '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
const cardapioImgDir = process.env.CARDAPIO_IMG_DIR && String(process.env.CARDAPIO_IMG_DIR).trim()
  ? String(process.env.CARDAPIO_IMG_DIR).trim()
  : join(__dirname, '..', 'fotocardapio');
app.use('/api/public/cardapio-img', express.static(cardapioImgDir));

app.use('/api/auth',authRouter);
app.use('/api/public',rateLimit(120),publicRouter);
app.get('/api/health',(_,res)=>res.json({ok:true}));
app.use('/api',authorize);
io.use((socket,next)=>{
 const session=sessionFor(socket.handshake.auth?.token);if(!session)return next(new Error('Acesso não autorizado'));
 socket.data.user=session;next();
});
// Rota de merge na app (antes do router) para não retornar 404
app.post('/api/comandas/merge', (req, res) => {
  const db = app.get('db');
  if (!db) return res.status(500).json({ error: 'Banco não disponível' });
  mergeComandasHandler(req, res, db);
});

// Excluir comanda inteira (frente de caixa) — antes do router para o POST ser reconhecido
app.post('/api/comandas/:id/clear', (req, res) => {
  const db = app.get('db');
  clearComandaHandler(req, res, db);
});

app.use('/api/comandas', comandasRouter);
app.use('/api/pedidos', pedidosRouter);
app.use('/api/menu', menuRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/print', printRouter);
app.use('/api/waiters', waitersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/finance', financeRouter);
app.use('/api/cash', cashRouter);


io.on('connection', (socket) => {
  socket.join(socket.data.user.isCaixa?'caixa':'garcom');
  socket.on('join-room', (room) => {
    if(socket.data.user.isCaixa && ['kitchen','grill','bar'].includes(room)) socket.join(room);
  });
  socket.on('leave-room', (room) => {
    socket.leave(room);
  });
});

app.set('io', io);
app.set('db', db);

function logIpv4Lan(port) {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      const fam = n.family;
      if ((fam === 'IPv4' || fam === 4) && !n.internal) ips.push(n.address);
    }
  }
  if (ips.length === 0) return;
  console.log('');
  console.log('API na rede local (celular/outro PC precisa alcançar esta porta):');
  for (const ip of ips) {
    console.log(`  http://${ip}:${port}/api/health`);
  }
  console.log('Se o celular não carregar dados: firewall do Windows pode estar bloqueando a porta', port, '— na raiz do projeto: npm run fw:windows (como Administrador)');
  console.log('');
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, process.env.PDV_HOST || '0.0.0.0', () => {
  announceAccess();
  console.log(`PDV Bosque API em ${process.env.PDV_HOST || '0.0.0.0'} — porta ${PORT}`);
  if (!process.env.PDV_HOST || process.env.PDV_HOST === '0.0.0.0') logIpv4Lan(PORT);
});
