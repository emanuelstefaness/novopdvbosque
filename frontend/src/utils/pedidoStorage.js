export const PEDIR_STORAGE_KEY = 'pedir_online_ultimo_pedido'

export function salvarPedidoLocal(order, telefone) {
  if (!order?.id) return
  try {
    localStorage.setItem(PEDIR_STORAGE_KEY, JSON.stringify({
      id: order.id,
      telefone: String(telefone || '').replace(/\D/g, ''),
      saved_at: Date.now(),
    }))
  } catch { /* ignore */ }
}

export function lerPedidoLocal() {
  try {
    const raw = localStorage.getItem(PEDIR_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.id) return null
    const dayMs = 24 * 60 * 60 * 1000
    if (data.saved_at && Date.now() - data.saved_at > dayMs) return null
    return data
  } catch {
    return null
  }
}
