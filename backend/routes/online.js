import { Router } from 'express';
import { statusPedidosOnline, definirModoPedidosOnline } from '../onlineSystem.js';
import { broadcastAll } from '../socket.js';

export const onlineRouter = Router();

// Estado atual dos pedidos online (qualquer usuário logado)
onlineRouter.get('/status', (req, res) => {
  res.json(statusPedidosOnline());
});

// Abrir / fechar / voltar ao horário automático (somente caixa)
onlineRouter.put('/status', (req, res) => {
  if (!req.user?.isCaixa) return res.status(403).json({ error: 'Esta operação requer acesso do caixa.' });
  const modo = String(req.body?.modo || '').trim().toLowerCase();
  if (!['aberto', 'fechado', 'automatico'].includes(modo)) {
    return res.status(400).json({ error: 'Modo inválido. Use aberto, fechado ou automatico.' });
  }
  definirModoPedidosOnline(modo);
  console.log(`[PEDIDOS ONLINE] ${new Date().toLocaleString('pt-BR')} modo definido para "${modo}"`);
  broadcastAll('orders', {});
  res.json(statusPedidosOnline());
});
