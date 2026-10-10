/** Regras dos combos do delivery. O servidor aceita no máximo 15% de desconto por item (routes/public.js). */
export const COMBO_MAX_SAVINGS = 8
export const COMBO_MAX_DISCOUNT_PERCENT = 15

/**
 * @param items       itens do cardápio online
 * @param normalize   função que tira acentos/caixa
 * @param formatPrice formatador de moeda (para o selo "Economize ...")
 * @param categories  categorias (para preferir o item da categoria Bebidas)
 */
export function buildCombos(items, normalize, formatPrice, categories = []) {
  const all = items || []
  const bebidasId = categories.find((c) => c.slug === 'bebidas')?.id
  const pratoFeito = all.find((i) => normalize(i.name).includes('prato') && normalize(i.name).includes('feito'))
  const churraspao = all.find((i) => {
    const n = normalize(i.name)
    if (n.includes('coracao')) return false
    return n.includes('churraspao') || n.includes('churras pao')
  })
  const isCoca = (i) => normalize(i.name).includes('coca')
  const coca =
    all.find((i) => isCoca(i) && i.category_id === bebidasId) ||
    all.find(isCoca) ||
    all.find((i) => normalize(i.name).includes('refrigerante'))

  const makeCombo = (id, name, products, discountPercent) => {
    if (products.some((p) => !p)) return null
    const pfSlots = []
    if (pratoFeito) products.forEach((p, i) => { if (Number(p.id) === Number(pratoFeito.id)) pfSlots.push(i) })
    const original = products.reduce((s, p) => s + Number(p.price || 0), 0)
    const rawDiscounted = Number((original * (1 - discountPercent / 100)).toFixed(2))
    const minAllowedPrice = Number((original - COMBO_MAX_SAVINGS).toFixed(2))
    const price = Math.max(rawDiscounted, minAllowedPrice)
    const save = Number((original - price).toFixed(2))
    return {
      id, name, emoji: '', products, pfSlots,
      description: 'Preço especial no combo para aumentar seu custo-benefício.',
      items: products.map((p) => p.name),
      originalPrice: original,
      price,
      badge: save > 0 ? `Economize ${formatPrice(save)}` : null,
    }
  }

  return [
    makeCombo('combo-pf-churraspao', 'PF + Churraspão + Coca', [pratoFeito, churraspao, coca], 12),
    makeCombo('combo-2-churraspao', '2 Churraspão + 2 Coca', [churraspao, churraspao, coca, coca], 15),
    makeCombo('combo-2-pf', '2 PF + 2 Coca', [pratoFeito, pratoFeito, coca, coca], 15),
  ].filter(Boolean)
}

/** Preço unitário de cada item dentro do combo (mesmo fator para todos). */
export function comboUnitPrices(combo) {
  const original = combo.products.reduce((s, p) => s + Number(p.price || 0), 0)
  const factor = original > 0 ? combo.price / original : 1
  return combo.products.map((p) => Number((Number(p.price || 0) * factor).toFixed(2)))
}
