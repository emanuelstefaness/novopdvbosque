/** Nomes diferentes do cardápio que usam o mesmo arquivo de imagem. */
export const IMAGE_SLUG_ALIAS = { 'red-bull': 'redbull' }

const strip = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "Coca-Cola 350ml" -> "coca-cola-350ml": basta salvar a foto com esse nome em public/menu-real-cutouts/. */
export function itemImageSlug(itemName) {
  const slug = strip(itemName).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return IMAGE_SLUG_ALIAS[slug] || slug
}
