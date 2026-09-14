import { useState, useEffect } from 'react'

import {parseSqlLocalDate,formatTempoDesdePedido} from '../utils/pedidoTime'

function useNowInterval(ms) {
  const [now, setNow] = useState(()=>Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/**
 * Tempo desde o lançamento do pedido; atualiza a cada 15s.
 * A partir de 20 min em vermelho para chamar atenção.
 */
export default function PedidoElapsed({ createdAt, className = '' }) {
  const now=useNowInterval(15000)
  const text = formatTempoDesdePedido(createdAt,now)
  if (!text) return null
  const t = parseSqlLocalDate(createdAt)
  const min = t ? Math.floor((now - t.getTime()) / 60000) : 0
  const urgent = min >= 20
  return (
    <span
      className={`tabular-nums ${urgent ? 'font-semibold text-red-600' : 'text-slate-500'} ${className}`}
      title={createdAt ? `Lançado: ${createdAt}` : undefined}
    >
      {text}
    </span>
  )
}
