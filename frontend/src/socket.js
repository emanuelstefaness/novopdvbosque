import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { getApiBase } from './devApiBase';

let socket = null;

export function getSocket() {
  if (!socket) {
    const url = getApiBase();
    let token;try{token=JSON.parse(localStorage.getItem('pdv_bosque_waiter'))?.token}catch{token=undefined}
    socket = io(url || undefined, { path: '/socket.io', transports: ['websocket', 'polling'],auth:{token},autoConnect:!!token });
  }
  return socket;
}

/**
 * Subscreve eventos do socket com cleanup correto (useEffect).
 * O callback mais recente é sempre usado via ref (evita listeners duplicados no render).
 */
export function useSocket(on) {
  const s = getSocket();
  const ref = useRef(on);
  useEffect(()=>{ref.current=on},[on]);

  useEffect(() => {
    const wrap =
      (eventName) =>
      (payload) => {
        const fn = ref.current;
        if (typeof fn === 'function') fn(payload, eventName);
      };

    const fComandas = wrap('comandas');
    const fPedidos = wrap('pedidos');
    const fNovo = wrap('novo-pedido-online');
    const fOrders = wrap('orders');

    s.on('comandas', fComandas);
    s.on('pedidos', fPedidos);
    s.on('novo-pedido-online', fNovo);
    s.on('orders', fOrders);

    return () => {
      s.off('comandas', fComandas);
      s.off('pedidos', fPedidos);
      s.off('novo-pedido-online', fNovo);
      s.off('orders', fOrders);
    };
  }, [s]);

  return s;
}

export function joinRoom(room) {
  getSocket().emit('join-room', room);
}

export function leaveRoom(room) {
  getSocket().emit('leave-room', room);
}
