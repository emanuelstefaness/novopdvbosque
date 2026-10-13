/** Regras de apresentação das telas de produção (Cozinha, Churrasqueira, Bar). Não altera dados nem a lógica de negócio. */
import { parseSqlLocalDate, earliestCreatedAt } from './pedidoTime.js'

/** Mesmo limite já usado no sistema: a partir de 20 min o tempo fica vermelho. */
export const ATRASO_MIN = 20

/** Agrupa os pedidos da fila por comanda mantendo a ordem de lançamento (Map: JS reordena chaves inteiras de objetos). */
export function agruparPorComanda(lista) {
  const mapa = new Map()
  const ordem = []
  for (const p of lista || []) {
    const chave = p.comanda_id
    if (!mapa.has(chave)) {
      mapa.set(chave, { comanda_id: chave, mesa: p.mesa, items: [] })
      ordem.push(chave)
    }
    mapa.get(chave).items.push(p)
  }
  return ordem.map((k) => mapa.get(k))
}

export function minutosDesde(sqlCreatedAt, agora = Date.now()) {
  const t = parseSqlLocalDate(sqlCreatedAt)
  if (!t) return 0
  return Math.max(0, Math.floor((agora - t.getTime()) / 60000))
}

/** Texto curto do tempo decorrido: "45 s", "12 min", "2 h 05", "3 d". */
export function formatarDecorrido(sqlCreatedAt, agora = Date.now()) {
  const t = parseSqlLocalDate(sqlCreatedAt)
  if (!t) return ''
  const seg = Math.max(0, Math.floor((agora - t.getTime()) / 1000))
  if (seg < 60) return `${seg} s`
  const min = Math.floor(seg / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)} d`
}

/** Prioridade da comanda pelo item mais antigo na fila. */
export function prioridadeDaComanda(items, agora = Date.now()) {
  const minutos = minutosDesde(earliestCreatedAt(items), agora)
  const nivel = minutos >= ATRASO_MIN ? 'atrasado' : 'normal'
  return { nivel, minutos }
}

export const ROTULO_PRIORIDADE = { atrasado: 'Atrasado', normal: 'No prazo' }

/** "Mesa 8" para números; textos como "Online #1" ficam como estão. Pedido do iFood não tem mesa (o selo já traz o número). */
export function rotuloDaMesa(item) {
  if (item?.comanda_origem === 'ifood') return null
  const mesa = String(item?.mesa ?? '').trim()
  if (!mesa) return null
  return /^\d+$/.test(mesa) ? `Mesa ${mesa}` : mesa
}

/**
 * Autoria dos lançamentos da comanda. Usa quem lançou cada item (launched_by); se o item não tiver o registro,
 * usa o garçom da comanda. Nunca inventa nome: pedido online/iFood sem garçom não mostra ninguém.
 */
export function autoriaDaComanda(items) {
  const nomes = []
  const ver = (n) => {
    const nome = String(n || '').trim()
    if (nome && !nomes.includes(nome)) nomes.push(nome)
  }
  for (const p of items || []) ver(p.launched_by || p.waiter_name)
  const online = (items || []).some((p) => p.comanda_origem === 'ifood' || p.comanda_tipo_online === 'delivery' || p.comanda_tipo_online === 'retirada')
  return { nomes, semGarcom: nomes.length === 0 && !online }
}

/** Quem lançou este item, quando difere do resumo do cabeçalho (comanda com mais de um autor). */
export function autorDoItem(pedidos) {
  return [...new Set((pedidos || []).map((p) => String(p.launched_by || '').trim()).filter(Boolean))]
}
