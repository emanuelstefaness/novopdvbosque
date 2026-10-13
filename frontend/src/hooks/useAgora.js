import { useEffect, useState } from 'react'

/** Relógio compartilhado das telas de produção: reavalia os tempos a cada 15 s. */
export default function useAgora(ms = 15000) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return agora
}
