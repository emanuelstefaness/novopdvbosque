let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

export function broadcastAll(event, data) {
  if (ioInstance) { if(event==='novo-pedido-online') ioInstance.to('caixa').emit(event,data); else ioInstance.emit(event,data); }
}

export function broadcastToRoom(room, event, data) {
  if (ioInstance) ioInstance.to(room).emit(event, data);
}
