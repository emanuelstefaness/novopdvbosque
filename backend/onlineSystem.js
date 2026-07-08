/** Dias e horário em que os pedidos online abrem automaticamente (hora local do servidor). */
const DIAS_ABERTOS = [3, 4, 5, 6]; // 0=domingo ... 3=quarta, 4=quinta, 5=sexta, 6=sábado
const ABERTURA = { horas: 19, minutos: 0 };
const FECHAMENTO = { horas: 23, minutos: 30 };

export const MENSAGEM_ONLINE_FECHADO =
  'Pedidos online abrem de quarta a sábado, das 19h às 23h30. Volte nesse horário!';

function dentroDoHorarioProgramado(agora = new Date()) {
  if (!DIAS_ABERTOS.includes(agora.getDay())) return false;
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const minutosAbertura = ABERTURA.horas * 60 + ABERTURA.minutos;
  const minutosFechamento = FECHAMENTO.horas * 60 + FECHAMENTO.minutos;
  return minutosAgora >= minutosAbertura && minutosAgora < minutosFechamento;
}

/** Variável de ambiente PEDIDOS_ONLINE_ATIVO força aberto/fechado, ignorando a programação (útil para testes). */
export function isPedidosOnlineAtivo() {
  const env = process.env.PEDIDOS_ONLINE_ATIVO;
  if (env !== undefined && String(env).trim() !== '') {
    const v = String(env).trim().toLowerCase();
    if (v === '0' || v === 'false' || v === 'off' || v === 'nao' || v === 'não') return false;
    if (v === '1' || v === 'true' || v === 'on' || v === 'sim') return true;
  }
  return dentroDoHorarioProgramado();
}

export function statusPedidosOnline() {
  const online_ativo = isPedidosOnlineAtivo();
  return {
    online_ativo,
    mensagem_fechado: online_ativo ? null : MENSAGEM_ONLINE_FECHADO,
  };
}
