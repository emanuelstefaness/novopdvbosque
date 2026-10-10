import { authRouter,authorize,sessionFor,announceAccess,rateLimit } from './auth.js';
import express from 'express';
import os from 'os';
import { createServer } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import compression from 'compression';
import { existsSync } from 'fs';
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
import { onlineRouter } from './routes/online.js';
import { ifoodRouter } from './routes/ifood.js';
import { ifoodConfigurado, criarClienteIfood, iniciarPollingIfood } from './ifood.js';

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
app.use(compression());
app.use(express.json());

// Log de lentidão: toda requisição /api acima de PDV_SLOW_MS (padrão 700ms) vai para o console com a duração.
const SLOW_MS = Number(process.env.PDV_SLOW_MS) || 700;
app.use('/api', (req, res, next) => {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms >= SLOW_MS) {
      console.warn(`[LENTO] ${new Date().toLocaleTimeString('pt-BR')} ${req.method} ${req.originalUrl.split('?')[0]} ${Math.round(ms)}ms (status ${res.statusCode})`);
    }
  });
  next();
});
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
app.use('/api/online', onlineRouter);
app.use('/api/ifood', ifoodRouter);


io.on('connection', (socket) => {
  socket.join(socket.data.user.isCaixa?'caixa':'garcom');
  socket.on('join-room', (room) => {
    if(socket.data.user.isCaixa && ['kitchen','grill','bar'].includes(room)) socket.join(room);
  });
  socket.on('leave-room', (room) => {
    socket.leave(room);
  });
});

// Frontend compilado (frontend/dist): o celular baixa poucos arquivos comprimidos em vez do servidor de desenvolvimento.
const distDir = join(__dirname, '..', 'frontend', 'dist');
const hasDist = existsSync(join(distDir, 'index.html'));
if (hasDist) {
  app.use(express.static(distDir, {
    index: false,
    setHeaders(res, filePath) {
      // arquivos com hash no nome nunca mudam: cache longo; o resto sempre revalida
      if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  // SPA: qualquer rota que não seja /api ou /socket.io devolve o index.html
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(distDir, 'index.html'));
  });
}

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
const HOST = process.env.PDV_HOST || '0.0.0.0';
httpServer.listen(PORT, HOST, () => {
  announceAccess();
  if (ifoodConfigurado()) {
    iniciarPollingIfood(db, criarClienteIfood({ clientId: process.env.IFOOD_CLIENT_ID, clientSecret: process.env.IFOOD_CLIENT_SECRET, baseUrl: process.env.IFOOD_API_BASE || undefined }));
    console.log('[iFood] integração ativa: consultando eventos a cada 30 s');
  }
  console.log(`PDV Bosque em ${HOST} — porta ${PORT}`);
  console.log(hasDist
    ? 'Frontend compilado: servindo frontend/dist (sem precisar do servidor de desenvolvimento).'
    : 'AVISO: frontend/dist não existe. Rode "npm run build" na pasta frontend (ou use npm run dev).');
  if (!process.env.PDV_HOST || process.env.PDV_HOST === '0.0.0.0') logIpv4Lan(PORT);
});

// Segunda porta com o mesmo app: o endereço antigo (:5173) continua funcionando para os garçons.
// Se o Vite de desenvolvimento estiver ocupando a 5173, só ignora.
// Só liga com "npm run start:web" (flag --web) ou PDV_WEB_PORT: no modo dev o Vite já usa a 5173.
const WEB_PORT = Number(process.env.PDV_WEB_PORT || (process.argv.includes('--web') ? 5173 : 0));
if (hasDist && WEB_PORT && String(WEB_PORT) !== String(PORT)) {
  const webServer = createServer(app);
  io.attach(webServer);
  webServer.on('error', (e) => {
    console.warn(`Porta web ${WEB_PORT} indisponível (${e.code}). O sistema segue em ${PORT}.`);
  });
  webServer.listen(WEB_PORT, HOST, () => {
    console.log(`Endereço dos garçons: porta ${WEB_PORT} (igual ao de antes) — http://<IP-do-PC>:${WEB_PORT}/`);
  });
}
