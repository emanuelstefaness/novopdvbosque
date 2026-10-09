import { db } from './db.js';

/** Dias e horário em que os pedidos online abrem automaticamente (hora local do servidor). */
const DIAS_ABERTOS = [3, 4, 5, 6]; // 0=domingo ... 3=quarta, 4=quinta, 5=sexta, 6=sábado
const ABERTURA = { horas: 19, minutos: 0 };
const FECHAMENTO = { horas: 23, minutos: 30 };
/** Uma decisão manual (abrir/fechar) vale até esta hora da manhã seguinte e depois volta ao horário automático. */
const HORA_FIM_MANUAL = 5;

export const MENSAGEM_ONLINE_FECHADO =
  'Pedidos online abrem de quarta a sábado, das 19h às 23h30. Volte nesse horário!';
export const MENSAGEM_ONLINE_PAUSADO =
  'Os pedidos online estão pausados no momento. Volte em instantes!';

const CHAVE = 'online_override';

function dentroDoHorarioProgramado(agora = new Date()) {
  if (!DIAS_ABERTOS.includes(agora.getDay())) return false;
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const minutosAbertura = ABERTURA.horas * 60 + ABERTURA.minutos;
  const minutosFechamento = FECHAMENTO.horas * 60 + FECHAMENTO.minutos;
  return minutosAgora >= minutosAbertura && minutosAgora < minutosFechamento;
}

/** Próximas 05:00 depois de "agora": quando a decisão manual deixa de valer. */
function proximoFimManual(agora = new Date()) {
  const d = new Date(agora);
  d.setHours(HORA_FIM_MANUAL, 0, 0, 0);
  if (d.getTime() <= agora.getTime()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function lerOverride() {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(CHAVE);
    if (!row) return null;
    const o = JSON.parse(row.value);
    if (!o || !['aberto', 'fechado'].includes(o.estado)) return null;
    if (!Number.isFinite(o.ate) || Date.now() >= o.ate) return null; // expirou: volta ao automático
    return o;
  } catch {
    return null;
  }
}

/** modo: 'aberto' | 'fechado' (manual, vale até 05h) | 'automatico' (segue o horário). */
export function definirModoPedidosOnline(modo) {
  if (modo === 'automatico') {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(CHAVE);
    return;
  }
  if (modo !== 'aberto' && modo !== 'fechado') throw new Error('Modo inválido');
  const valor = JSON.stringify({ estado: modo, ate: proximoFimManual(), definido_em: Date.now() });
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(CHAVE, valor);
}

/** Variável de ambiente PEDIDOS_ONLINE_ATIVO força aberto/fechado, ignorando tudo (útil para testes). */
function envForcado() {
  const env = process.env.PEDIDOS_ONLINE_ATIVO;
  if (env === undefined || String(env).trim() === '') return null;
  const v = String(env).trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'nao' || v === 'não') return false;
  if (v === '1' || v === 'true' || v === 'on' || v === 'sim') return true;
  return null;
}

export function isPedidosOnlineAtivo() {
  const forcado = envForcado();
  if (forcado !== null) return forcado;
  const o = lerOverride();
  if (o) return o.estado === 'aberto';
  return dentroDoHorarioProgramado();
}

export function statusPedidosOnline() {
  const online_ativo = isPedidosOnlineAtivo();
  const o = lerOverride();
  const dentro_do_horario = dentroDoHorarioProgramado();
  let mensagem_fechado = null;
  if (!online_ativo) mensagem_fechado = o ? MENSAGEM_ONLINE_PAUSADO : MENSAGEM_ONLINE_FECHADO;
  return {
    online_ativo,
    mensagem_fechado,
    modo: envForcado() !== null ? 'forcado_ambiente' : o ? `manual_${o.estado}` : 'automatico',
    manual_ate: o ? o.ate : null,
    dentro_do_horario,
  };
}
