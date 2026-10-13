import { useEffect, useRef, useState } from 'react'

/**
 * Marca por alguns segundos as comandas que acabaram de entrar na fila (destaque discreto).
 * `carregado` evita destacar tudo na primeira carga da tela.
 */
export default function useComandasNovas(ids, carregado, duracaoMs = 8000) {
  const vistos = useRef(null)
  const [novas, setNovas] = useState(() => new Set())
  const chave = ids.join(',')

  useEffect(() => {
    if (!carregado) return undefined
    if (vistos.current === null) {
      vistos.current = new Set(ids)
      return undefined
    }
    const novos = ids.filter((id) => !vistos.current.has(id))
    ids.forEach((id) => vistos.current.add(id))
    if (novos.length === 0) return undefined
    setNovas((s) => new Set([...s, ...novos]))
    const t = setTimeout(() => {
      setNovas((s) => {
        const n = new Set(s)
        novos.forEach((i) => n.delete(i))
        return n
      })
    }, duracaoMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, carregado])

  return novas
}
