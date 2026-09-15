import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import { getApiBase } from '../devApiBase'
import PedidoOnlineAcompanhamento from '../components/PedidoOnlineAcompanhamento'
import { lerPedidoLocal, salvarPedidoLocal } from '../utils/pedidoStorage'
import {
  lancheComOpcionaisAdicionais,
  itemAceitaCebolaCaramelizada,
  itemAceitaHamburguerExtra,
  unitPrecoComAddons,
  PRECO_CEbola_CARAMELIZADA,
  PRECO_HAMBURGUER_EXTRA
} from '../utils/lancheAddons'
import Icon from '../components/Icon'
import './PedirOnline.css'

const API = getApiBase()
/** Fallback se a API ainda não devolveu a taxa (backend antigo). */
const TAXA_ENTREGA_FALLBACK = 10

const BEBIDAS_SLUGS = ['bebidas', 'caipirinhas']
const HIDDEN_CATEGORY_SLUGS = ['chopp-cerveja', 'drinks', 'doses']
const IMAGE_FILE_BY_ITEM_NAME = {
  'churraspao': 'churraspao.png',
  'coracao de frango': 'coração.png',
  'entrevero': 'entrevero',
  'gado com bacon': 'gadobacon.png',
  'medalhao suino': 'medalhaosuino.png',
  'pao de alho': 'pao de alho.png',
  'prato feito do bosque': 'pratofeito.png',
  'queijo coalho': 'queijocoalho.png',
  'salada do bosque': 'salada do bosque.png',
  'x-bosque': 'xbosque.png',
  'churraspao de coracao': 'churraspao-coracao.png'
}
const REAL_CUTOUT_IMAGE_BY_ITEM_NAME = {
  'gado com bacon': '/menu-real-cutouts/gado-com-bacon.png',
  'gado com bacon e legumes': '/menu-real-cutouts/gado-com-bacon-e-legumes.png',
  'kafta': '/menu-real-cutouts/kafta.png',
  'coracao de frango': '/menu-real-cutouts/coracao-de-frango.png',
  'medalhao suino': '/menu-real-cutouts/medalhao-suino.png',
  'medalhao de frango': '/menu-real-cutouts/medalhao-de-frango.png',
  'medalhao de mandioca': '/menu-real-cutouts/medalhao-de-mandioca.png',
  'pao de alho': '/menu-real-cutouts/pao-de-alho.png',
  'queijo coalho': '/menu-real-cutouts/queijo-coalho.png',
  'entrevero': '/menu-real-cutouts/entrevero.png',
  'churraspao': '/menu-real-cutouts/churraspao.png',
  'churraspao de coracao': '/menu-real-cutouts/churraspao-de-coracao.png',
  'prato feito do bosque': '/menu-real-cutouts/prato-feito-do-bosque.png',
  'salada do bosque': '/menu-real-cutouts/salada-do-bosque.png',
  'x-bosque': '/menu-real-cutouts/x-bosque.png',
  'caipirinha maracuja': '/menu-real-cutouts/caipirinha-maracuja.png',
  'caipirinha limao': '/menu-real-cutouts/caipirinha-limao.png',
  'caipirinha morango': '/menu-real-cutouts/caipirinha-morango.png',
  'caipirinha kiwi': '/menu-real-cutouts/caipirinha-kiwi.png',
  'caipirinha abacaxi': '/menu-real-cutouts/caipirinha-abacaxi.png',
  'caipirinha mista': '/menu-real-cutouts/caipirinha-mista.png',
  'caipirinha yakult': '/menu-real-cutouts/caipirinha-yakult.png',
}

/**
 * Textos de vitrine só no Pedir online (não vão para API, pedido, cozinha nem impressão).
 * Chave = nome do item normalizado (ver `normalize()`).
 */
const PEDIR_MARKETING_DESC = {
  entrevero:
    'O prato típico do Paraná em nossa versão: entrevero suculento, com mix de carnes (bovina, frango, suíno e calabresa), pimentão e cebola salteados no shoyu — sabor marcante que abre o apetite só de sentir o cheiro.',
  'prato feito do bosque':
    'Comida de domingo no meio da semana: arroz soltinho, salada do bosque, maionese cremosa e um espetinho à sua escolha — simples, caprichado e com gostinho de casa.',
  'salada do bosque':
    'Mix de alfaces frescas com cenoura e pepino, finalizada com bacon crocante, parmesão, torradas e molhos especiais — leve, crocante e cheia de sabor.',
  arvoredo:
    'O premium da casa: ancho na brasa, suculento e no ponto certo, acompanhado de arroz, maionese cremosa e nossa Salada do Bosque — completo, intenso e simplesmente irresistível.',
  'x bosque':
    'Hambúrguer de kafta suculento, cheddar derretido, alface americana crocante e cebola caramelizada — combinação intensa, agridoce e simplesmente viciante.',
  'x-bosque':
    'Hambúrguer de kafta suculento, cheddar derretido, alface americana crocante e cebola caramelizada — combinação intensa, agridoce e simplesmente viciante.',
  churraspao:
    'Carne bovina suculenta, alface americana crocante, maionese da casa e uma camada generosa de queijo gratinado — muito queijo, muito sabor e zero moderação.',
  'churraspao de coracao':
    'Baguete crocante recheada com coração de galinha suculento, pasta de alho Santa Massa, alface americana fresca e uma generosa camada de queijo gratinado.',
  'gado com bacon':
    'Carne bovina suculenta com pedaços de bacon — defumado, intenso e impossível de resistir.',
  'gado com bacon e legumes':
    'Carne bovina macia com legumes grelhados — leve, saboroso e no ponto certo.',
  kafta:
    'Hambúrguer artesanal de kafta com pequenos cubos de pimentão e alho, dourado diretamente na brasa.',
  'medalhao de frango':
    'Frango macio envolto em bacon, dourado na brasa — suculento e cheio de sabor.',
  'medalhao suino':
    'Carne suína temperada, envolta em bacon e grelhada — macia, dourada e irresistível.',
  'coracao de frango':
    'Clássico da brasa, bem temperado e suculento — sabor marcante em cada mordida.',
  'medalhao de mandioca':
    'Mandioca macia envolta em bacon crocante — combinação perfeita de textura e sabor.',
  'queijo coalho':
    'Queijo dourado na brasa, crocante por fora e macio por dentro — simples e delicioso.',
  'pao de alho':
    'Pão crocante com recheio cremoso de alho — dourado, cheiroso e viciante.',
}

const formatPrice = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const normalize = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const bySort = (a, b) => (a.sort_order || 0) - (b.sort_order || 0)

const slugOrder = ['espetinhos', 'lanches', 'pratos', 'porcoes']
const CATEGORY_ICON_BY_SLUG = {
  espetinhos: 'skewer',
  lanches: 'burger',
  pratos: 'plate',
  porcoes: 'bowl',
  acompanhamentos: 'leaf',
  sobremesas: 'dessert',
  bebidas: 'bottle',
  caipirinhas: 'cocktail',
}

function categoryArcStyle(index, total) {
  const progress = index / Math.max(1, total - 1)
  const normalizedX = progress * 2 - 1
  const curve = 1 - Math.sqrt(Math.max(0, 1 - normalizedX * normalizedX))
  return {
    '--arc-x': `${8 + progress * 84}%`,
    '--arc-y': `${18 + curve * 110}px`,
  }
}

function isPratoFeitoItem(item) {
  if (!item) return false
  // API/SQLite pode mandar 1, "1", true; comparação solta cobre todos
  if (item.is_prato_feito == 1 || item.is_prato_feito === true) return true
  const n = normalize(item.name)
  return n.includes('prato') && n.includes('feito')
}

/** Descrição de vitrine só no front do Pedir (não repassar ao backend). */
function descricaoPedirSomenteFront(item) {
  if (!item?.name) return null
  const n = normalize(item.name)
  if (PEDIR_MARKETING_DESC[n]) return PEDIR_MARKETING_DESC[n]
  if (n.includes('arvoredo')) return PEDIR_MARKETING_DESC.arvoredo
  if (isPratoFeitoItem(item)) return PEDIR_MARKETING_DESC['prato feito do bosque']
  return null
}

function textoDescricaoItemPedir(item) {
  return descricaoPedirSomenteFront(item) || item.description || 'Delicioso, preparado na hora com ingredientes selecionados.'
}

function getItemImageUrl(apiBase, itemName) {
  const fileName = IMAGE_FILE_BY_ITEM_NAME[normalize(itemName)]
  if (!fileName) return null
  return `${apiBase}/api/public/cardapio-img/${encodeURIComponent(fileName)}`
}

/** Nome do arquivo em `public/fotocardapio/` (deploy Vercel = mesmo site do Pedir). */
function fotocardapioFileForItemName(itemName) {
  const n = normalize(itemName)
  return IMAGE_FILE_BY_ITEM_NAME[n] || null
}

/** URL servida pelo Vite/Vercel a partir da pasta `frontend/public/fotocardapio/`. */
function fotocardapioPublicUrl(itemName) {
  const file = fotocardapioFileForItemName(itemName)
  if (!file) return null
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return `${base}/fotocardapio/${encodeURIComponent(file)}`.replace(/\/+/g, '/')
}

function resolvePedirItemImages(itemName, apiBase) {
  const transparent = REAL_CUTOUT_IMAGE_BY_ITEM_NAME[normalize(itemName)]
  const local = fotocardapioPublicUrl(itemName)
  const api = apiBase ? getItemImageUrl(apiBase, itemName) : null
  if (transparent) return { image: transparent, imageFallback: local || api || null, transparent: true }
  if (local && api && local !== api) return { image: local, imageFallback: api }
  if (local) return { image: local, imageFallback: api || null }
  return { image: api || null, imageFallback: null }
}

function productVisualKind(itemName) {
  const name = normalize(itemName)
  if (name.includes('caipirinha')) return 'drink'
  if (name === 'kafta') return 'patty'
  if (name.includes('churraspao') || name.includes('x-bosque') || name.includes('x bosque')) return 'sandwich'
  if (name.includes('entrevero') || name.includes('prato feito') || name.includes('salada do bosque')) return 'dish'
  return 'skewer'
}

function ProductCard({ item, badges = [], categoryIcon = 'book', onOpen, imageTransitionActive = false }) {
  const [failedImages,setFailedImages]=useState([])
  const imgSrc=[item.image,item.imageFallback].find(src=>src&&!failedImages.includes(src))||null
  const onImgError=()=>setFailedImages(prev=>[...prev,imgSrc])

  return (
    <article className={`delivery-product-card ${item.transparent ? `has-transparent-image image-${productVisualKind(item.name)}` : ''}`}>
      <button type="button" onClick={() => onOpen(item)} className="delivery-product-hit" aria-label={`Abrir ${item.name}, ${formatPrice(item.price)}`}>
        <div className="delivery-product-image">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt=""
              onError={onImgError}
              style={imageTransitionActive ? { viewTransitionName: 'delivery-product-image' } : undefined}
            />
          ) : (
            <div className="delivery-image-fallback"><Icon name={categoryIcon} size={30} /><span>Foto em breve</span></div>
          )}
        </div>
        <div className="delivery-product-copy">
          <h3>{item.name}</h3>
          <p>
            {textoDescricaoItemPedir(item)}
          </p>
          {badges.length > 0 && (
            <div className="delivery-badges">
              {badges.map((b) => (
                <span key={b}>
                  {b}
                </span>
              ))}
            </div>
          )}
          <strong>{formatPrice(item.price)}</strong>
        </div>
        <span className="delivery-product-plus" aria-hidden="true">+</span>
      </button>
    </article>
  )
}

function ComboCard({ combo, onRequestAddCombo }) {
  return (
    <article className="rounded-2xl border border-amber-200 bg-combo p-4 shadow-card">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-black text-[hsl(var(--menu-fg))]">{combo.emoji} {combo.name}</h3>
          <p className="text-sm text-slate-700">{combo.description}</p>
        </div>
        {combo.badge && <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-bold text-savings">{combo.badge}</span>}
      </div>
      <ul className="mb-3 space-y-1 text-sm text-slate-700">
        {combo.items.map((i) => <li key={i} className="before:mr-2 before:text-red-500 before:content-['•']">{i}</li>)}
      </ul>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-sm text-slate-500 line-through">{formatPrice(combo.originalPrice)}</p>
          <p className="font-display text-2xl font-black text-[hsl(var(--menu-primary))]">{formatPrice(combo.price)}</p>
        </div>
        <button
          type="button"
          onClick={() => onRequestAddCombo(combo)}
          className="rounded-xl bg-[hsl(var(--menu-primary))] px-4 py-3 font-bold text-white transition hover:brightness-95 active:scale-95"
        >
          Adicionar combo
        </button>
      </div>
    </article>
  )
}

export default function PedirOnline() {
  const [step, setStep] = useState('menu')
  const [menu, setMenu] = useState({ categories: [], items: [] })
  const [taxaEntregaDelivery, setTaxaEntregaDelivery] = useState(TAXA_ENTREGA_FALLBACK)
  const [entregaGratis, setEntregaGratis] = useState(false)
  const [onlineAtivo, setOnlineAtivo] = useState(true)
  const [mensagemFechado, setMensagemFechado] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastOrder, setLastOrder] = useState(null)
  const [pedidoSalvoLocal, setPedidoSalvoLocal] = useState(() => lerPedidoLocal())
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [modalProduct, setModalProduct] = useState(null)
  const [transitionProductId, setTransitionProductId] = useState(null)
  const [modalQty, setModalQty] = useState(1)
  const [modalObs, setModalObs] = useState('')
  const [modalPfEspetinhoId, setModalPfEspetinhoId] = useState('')
  const [modalExtraCebola, setModalExtraCebola] = useState(false)
  const [modalExtraBurger, setModalExtraBurger] = useState(false)
  const [comboModal, setComboModal] = useState(null)
  const [comboPfSelections, setComboPfSelections] = useState({})
  const [lastSuggestedAddedId, setLastSuggestedAddedId] = useState(null)
  const [cart, setCart] = useState([])
  const [activeCatId, setActiveCatId] = useState('all')
  const [menuSearch, setMenuSearch] = useState('')
  const [checkout, setCheckout] = useState({
    tipo: 'retirada',
    cliente_nome: '',
    cliente_telefone: '',
    cliente_email: '',
    observacoes: '',
    forma_pagamento: 'pix',
    endereco_rua: '',
    endereco_numero: '',
    endereco_complemento: '',
    endereco_bairro: '',
    endereco_referencia: '',
  })

  const apiBase = API || (typeof window !== 'undefined' ? window.location.origin : '')

  const loadMenu = () => {
    setLoading(true)
    setError('')
    fetch(`${apiBase}/api/public/menu`)
      .then((r) => {
        if (!r.ok) throw new Error(`Não foi possível carregar o cardápio (${r.status})`)
        return r.json()
      })
      .then((data) => {
        const items = (data.items || []).map((it) => {
          const { image, imageFallback, transparent } = resolvePedirItemImages(it.name, apiBase)
          return { ...it, image, imageFallback, transparent: !!transparent }
        })
        setMenu({ ...data, items })
        setOnlineAtivo(data.online_ativo !== false)
        setMensagemFechado(data.mensagem_fechado || 'Pedidos online indisponíveis no momento.')
        if (typeof data.taxa_entrega_delivery === 'number') {
          setTaxaEntregaDelivery(data.taxa_entrega_delivery)
          setEntregaGratis(data.taxa_entrega_delivery === 0 || !!data.entrega_gratis)
        } else {
          setEntregaGratis(!!data.entrega_gratis)
        }
      })
      .catch((err) => {
        const msg = err?.message || ''
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
          setError('Não foi possível conectar à API. O servidor do restaurante precisa estar ligado (backend + túnel Cloudflare).')
        } else {
          setError(msg || 'Erro ao carregar cardápio')
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadMenu() }, [])

  const resetNovoPedido = () => {
    setStep('menu')
    setLastOrder(null)
    setCart([])
  }

  const categoriesBySlug = useMemo(() => {
    const m = {}
    for (const c of menu.categories || []) {
      if (HIDDEN_CATEGORY_SLUGS.includes(c.slug)) continue
      m[c.slug] = c
    }
    return m
  }, [menu.categories])

  const itemsByCategory = useMemo(() => {
    const map = new Map()
    for (const it of menu.items || []) {
      const cat = (menu.categories || []).find((c) => c.id === it.category_id)
      if (cat && HIDDEN_CATEGORY_SLUGS.includes(cat.slug)) continue
      const list = map.get(it.category_id) || []
      list.push(it)
      map.set(it.category_id, list)
    }
    return map
  }, [menu.items, menu.categories])

  const orderedCategories = useMemo(() => {
    const fixed = slugOrder
      .map((slug) => categoriesBySlug[slug])
      .filter(Boolean)
    const filteredCategories = (menu.categories || []).filter((c) => !HIDDEN_CATEGORY_SLUGS.includes(c.slug))
    const bebidas = filteredCategories.filter((c) => BEBIDAS_SLUGS.includes(c.slug)).sort(bySort)
    const rest = filteredCategories.filter((c) => !fixed.find((x) => x.id === c.id) && !BEBIDAS_SLUGS.includes(c.slug)).sort(bySort)
    return [...fixed, ...rest, ...bebidas]
  }, [menu.categories, categoriesBySlug])

  const arcCategories = useMemo(() => {
    const requestedOrder = [
      'bebidas',
      'pratos',
      'porcoes',
      'espetinhos',
      null,
      'lanches',
      'acompanhamentos',
      'sobremesas',
      'caipirinhas',
    ]
    return requestedOrder.map((slug) => slug === null ? null : categoriesBySlug[slug]).filter((category, index) => category || requestedOrder[index] === null)
  }, [categoriesBySlug])

  const espetinhosOnline = useMemo(() => {
    const espetinhosCat = (menu.categories || []).find((c) => c.slug === 'espetinhos')
    if (!espetinhosCat) return []
    return (menu.items || [])
      .filter((i) => i.category_id === espetinhosCat.id)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
  }, [menu.categories, menu.items])

  const visibleMenuItems = useMemo(() => {
    const visible = activeCatId === 'all'
      ? (menu.items || []).filter((item) => {
          const cat = (menu.categories || []).find((c) => c.id === item.category_id)
          return cat && !HIDDEN_CATEGORY_SLUGS.includes(cat.slug)
        })
      : (itemsByCategory.get(activeCatId) || [])
    const query = normalize(menuSearch.trim())
    return [...visible]
      .filter((item) => !query || normalize(`${item.name} ${textoDescricaoItemPedir(item)}`).includes(query))
      .sort(bySort)
  }, [activeCatId, menuSearch, menu.items, menu.categories, itemsByCategory])

  const destaqueCoracaoItem = useMemo(() => {
    const all = menu.items || []
    return all.find((i) => {
      const n = normalize(i.name)
      return (n.includes('churraspao') || n.includes('churras pao')) && n.includes('coracao')
    })
  }, [menu.items])

  const highlightItems = useMemo(() => {
    const all = menu.items || []
    const espetoTop = all.find((i) => normalize(i.name).includes('gado') && normalize(i.name).includes('bacon'))
    const pratoFeito = all.find((i) => normalize(i.name).includes('prato') && normalize(i.name).includes('feito'))
    const churraspao = all.find((i) => {
      const n = normalize(i.name)
      if (n.includes('coracao')) return false
      return n.includes('churraspao') || n.includes('churras pao')
    })
    return [espetoTop, pratoFeito, churraspao].filter(Boolean)
  }, [menu.items])

  const combos = useMemo(() => {
    const all = menu.items || []
    const pratoFeito = all.find((i) => normalize(i.name).includes('prato') && normalize(i.name).includes('feito'))
    const churraspao = all.find((i) => {
      const n = normalize(i.name)
      if (n.includes('coracao')) return false
      return n.includes('churraspao') || n.includes('churras pao')
    })
    const coca = all.find((i) => normalize(i.name).includes('coca')) || all.find((i) => normalize(i.name).includes('refrigerante'))

    const makeCombo = (id, name, emoji, products, discountPercent) => {
      if (products.some((p) => !p)) return null
      // Índices no combo onde entra o mesmo item do "Prato Feito" do cardápio (não depende só de is_prato_feito no JSON)
      const pfSlots = []
      if (pratoFeito) {
        products.forEach((p, i) => {
          if (p && Number(p.id) === Number(pratoFeito.id)) pfSlots.push(i)
        })
      }
      const original = products.reduce((s, p) => s + Number(p.price || 0), 0)
      const rawDiscounted = Number((original * (1 - discountPercent / 100)).toFixed(2))
      const maxSavings = 8
      const minAllowedPrice = Number((original - maxSavings).toFixed(2))
      const discounted = Math.max(rawDiscounted, minAllowedPrice)
      const save = Number((original - discounted).toFixed(2))
      return {
        id,
        name,
        emoji,
        products,
        pfSlots,
        description: 'Preço especial no combo para aumentar seu custo-benefício.',
        items: products.map((p) => p.name),
        originalPrice: original,
        price: discounted,
        badge: save > 0 ? `Economize ${formatPrice(save)}` : null,
      }
    }

    return [
      makeCombo('combo-pf-churraspao', 'Combo PF + Churraspão + Coca', '', [pratoFeito, churraspao, coca], 12),
      makeCombo('combo-2-churraspao', 'Combo 2 Churraspão + 2 Coca', '', [churraspao, churraspao, coca, coca], 15),
      makeCombo('combo-2-pf', 'Combo 2 PF + 2 Coca', '', [pratoFeito, pratoFeito, coca, coca], 15),
    ].filter(Boolean)
  }, [menu.items, categoriesBySlug])

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0)
  const subtotalItens = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart])
  const taxaEntrega = checkout.tipo === 'delivery' ? taxaEntregaDelivery : 0
  const totalPrice = subtotalItens + taxaEntrega

  const suggestedItems = useMemo(() => {
    if (!modalProduct) return []
    const all = menu.items || []
    const selectedName = normalize(modalProduct.name)
    const coca = all.find((i) => normalize(i.name).includes('coca')) || all.find((i) => normalize(i.name).includes('refrigerante'))
    const batata = all.find((i) => normalize(i.name).includes('batata'))
    const molho = all.find((i) => normalize(i.name).includes('molho'))
    const churraspao = all.find((i) => {
      const n = normalize(i.name)
      if (n.includes('coracao')) return false
      return n.includes('churraspao') || n.includes('churras pao')
    })
    const pratoFeito = all.find((i) => normalize(i.name).includes('prato') && normalize(i.name).includes('feito'))

    let picks = [coca, batata, molho]
    if (selectedName.includes('churraspao')) picks = [coca, batata, pratoFeito]
    if (selectedName.includes('prato') && selectedName.includes('feito')) picks = [coca, batata, churraspao]
    if (selectedName.includes('espetinho') || selectedName.includes('gado')) picks = [coca, batata, molho]
    return picks.filter(Boolean).filter((i) => i.id !== modalProduct.id).slice(0, 3)
  }, [modalProduct, menu.items])

  const modalProductCategorySlug = useMemo(() => {
    if (!modalProduct?.category_id) return ''
    return (menu.categories || []).find((c) => c.id === modalProduct.category_id)?.slug || ''
  }, [modalProduct, menu.categories])

  const modalUnitWithAddons = useMemo(() => {
    if (!modalProduct) return 0
    if (isPratoFeitoItem(modalProduct) || !lancheComOpcionaisAdicionais(modalProduct, modalProductCategorySlug)) {
      return Number(modalProduct.price || 0)
    }
    return unitPrecoComAddons(Number(modalProduct.price || 0), modalProduct, {
      extra_caramelized_onion: modalExtraCebola,
      extra_hamburger: modalExtraBurger
    })
  }, [modalProduct, modalProductCategorySlug, modalExtraCebola, modalExtraBurger])

  const canAnimateProductTransition = () => (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  const resetModalFields = () => {
    setModalQty(1)
    setModalObs('')
    setModalPfEspetinhoId('')
    setModalExtraCebola(false)
    setModalExtraBurger(false)
  }

  const openProduct = (item) => {
    if (!canAnimateProductTransition() || !item.image) {
      setModalProduct(item)
      return
    }
    flushSync(() => setTransitionProductId(item.id))
    const transition = document.startViewTransition(() => {
      flushSync(() => setModalProduct(item))
    })
    transition.finished.finally(() => setTransitionProductId(null))
  }

  const closeProduct = () => {
    if (!modalProduct) return
    const productId = modalProduct.id
    const finishClose = () => {
      setModalProduct(null)
      resetModalFields()
    }
    if (!canAnimateProductTransition() || !modalProduct.image) {
      finishClose()
      return
    }
    flushSync(() => setTransitionProductId(productId))
    const transition = document.startViewTransition(() => {
      flushSync(finishClose)
    })
    transition.finished.finally(() => setTransitionProductId(null))
  }

  useEffect(() => {
    if (!modalProduct) return
    setModalQty(1)
    setModalObs('')
    setModalPfEspetinhoId('')
    setModalExtraCebola(false)
    setModalExtraBurger(false)
  }, [modalProduct])

  /** `user_note` = só texto digitado pelo cliente (ex.: ponto da carne). Não guarda rótulos de combo na UI. */
  const addItem = (item, quantity = 1, userNote = null, fixedPrice = null, pratoFeitoEspetinhoId = null, extras = null) => {
    const note = userNote != null && String(userNote).trim() !== '' ? String(userNote).trim() : null
    const flags = extras && typeof extras === 'object' ? extras : {}
    const unit =
      fixedPrice != null && fixedPrice !== undefined
        ? Number(fixedPrice)
        : unitPrecoComAddons(Number(item.price || 0), item, {
            extra_caramelized_onion: flags.extra_caramelized_onion,
            extra_hamburger: flags.extra_hamburger
          })
    setCart((prev) => {
      const idx = prev.findIndex((x) =>
        x.id === item.id &&
        (x.user_note || '') === (note || '') &&
        Number(x.prato_feito_espetinho_id || 0) === Number(pratoFeitoEspetinhoId || 0) &&
        !!x.extra_caramelized_onion === !!flags.extra_caramelized_onion &&
        !!x.extra_hamburger === !!flags.extra_hamburger
      )
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity }
        return next
      }
      const pfSelected = Number(pratoFeitoEspetinhoId)
      return [...prev, {
        id: item.id,
        name: item.name,
        quantity,
        price: unit,
        user_note: note,
        prato_feito_espetinho_id: pfSelected > 0 ? pfSelected : null,
        extra_caramelized_onion: !!flags.extra_caramelized_onion,
        extra_hamburger: !!flags.extra_hamburger
      }]
    })
  }

  const addFromModal = () => {
    if (!modalProduct) return
    const isPratoFeito = isPratoFeitoItem(modalProduct)
    if (isPratoFeito && !Number(modalPfEspetinhoId)) {
      setError('Selecione o espetinho que acompanha o Prato Feito.')
      return
    }
    setError('')
    const obs = modalObs.trim()
    const composed = obs || null
    const extras =
      !isPratoFeito && lancheComOpcionaisAdicionais(modalProduct, modalProductCategorySlug)
        ? { extra_caramelized_onion: modalExtraCebola, extra_hamburger: modalExtraBurger }
        : null
    addItem(modalProduct, modalQty, composed, null, isPratoFeito ? Number(modalPfEspetinhoId) : null, extras)
    closeProduct()
  }

  const addSuggested = (item) => {
    if (!modalProduct) return
    addItem(item, 1, null)
    setLastSuggestedAddedId(item.id)
    setTimeout(() => setLastSuggestedAddedId(null), 900)
  }

  const getCartQtyById = (itemId) => cart
    .filter((c) => c.id === itemId)
    .reduce((sum, c) => sum + c.quantity, 0)

  const addComboInternal = (combo, pfEspByIndex) => {
    const original = combo.products.reduce((s, p) => s + Number(p.price || 0), 0)
    const factor = original > 0 ? combo.price / original : 1
    combo.products.forEach((p, idx) => {
      const adjusted = Number((Number(p.price || 0) * factor).toFixed(2))
      let espOk = null
      if (pfEspByIndex && isPratoFeitoItem(p)) {
        const e = Number(pfEspByIndex[idx])
        if (Number.isFinite(e) && e > 0) espOk = e
      }
      addItem(p, 1, null, adjusted, espOk)
    })
  }

  const requestAddCombo = (combo) => {
    const pfIndices = Array.isArray(combo.pfSlots) && combo.pfSlots.length > 0
      ? combo.pfSlots
      : combo.products.map((p, i) => i).filter((i) => isPratoFeitoItem(combo.products[i]))
    if (pfIndices.length === 0) {
      addComboInternal(combo, null)
      return
    }
    const initial = {}
    pfIndices.forEach((i) => { initial[i] = '' })
    setError('')
    setComboPfSelections(initial)
    setComboModal(combo)
  }

  const confirmComboModal = () => {
    if (!comboModal) return
    const pfIndices = Array.isArray(comboModal.pfSlots) && comboModal.pfSlots.length > 0
      ? comboModal.pfSlots
      : comboModal.products.map((p, i) => i).filter((i) => isPratoFeitoItem(comboModal.products[i]))
    for (const i of pfIndices) {
      const v = comboPfSelections[i]
      if (!v || !Number(v)) {
        setError('Selecione o espetinho para cada Prato Feito do combo.')
        return
      }
    }
    setError('')
    const map = {}
    pfIndices.forEach((idx) => { map[idx] = Number(comboPfSelections[idx]) })
    addComboInternal(comboModal, map)
    setComboModal(null)
    setComboPfSelections({})
  }

  const updateQty = (id, userNote, pratoFeitoEspetinhoId, extraOnion, extraBurger, delta) => {
    setCart((prev) => {
      const idx = prev.findIndex((x) =>
        x.id === id &&
        (x.user_note || '') === (userNote || '') &&
        Number(x.prato_feito_espetinho_id || 0) === Number(pratoFeitoEspetinhoId || 0) &&
        !!x.extra_caramelized_onion === !!extraOnion &&
        !!x.extra_hamburger === !!extraBurger
      )
      if (idx < 0) return prev
      const next = [...prev]
      const q = next[idx].quantity + delta
      if (q <= 0) return prev.filter((_, i) => i !== idx)
      next[idx] = { ...next[idx], quantity: q }
      return next
    })
  }

  const clearCart = () => setCart([])

  const handleSubmitOrder = async (e) => {
    e.preventDefault()
    if (!checkout.cliente_nome.trim() || !checkout.cliente_telefone.trim()) {
      setError('Nome e telefone são obrigatórios.')
      return
    }
    if (checkout.tipo === 'delivery' && (!checkout.endereco_rua.trim() || !checkout.endereco_numero.trim() || !checkout.endereco_bairro.trim())) {
      setError('Para delivery, informe rua, número e bairro.')
      return
    }
    const formas = ['pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'vale']
    if (!formas.includes(String(checkout.forma_pagamento || '').toLowerCase())) {
      setError('Selecione a forma de pagamento.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const r = await fetch(`${apiBase}/api/public/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: checkout.tipo,
          cliente_nome: checkout.cliente_nome.trim(),
          cliente_telefone: checkout.cliente_telefone.trim(),
          cliente_email: checkout.cliente_email.trim() || undefined,
          observacoes: checkout.observacoes.trim() || undefined,
          forma_pagamento: String(checkout.forma_pagamento || 'pix').toLowerCase(),
          endereco_rua: checkout.tipo === 'delivery' ? checkout.endereco_rua.trim() : undefined,
          endereco_numero: checkout.tipo === 'delivery' ? checkout.endereco_numero.trim() : undefined,
          endereco_complemento: checkout.tipo === 'delivery' ? checkout.endereco_complemento.trim() : undefined,
          endereco_bairro: checkout.tipo === 'delivery' ? checkout.endereco_bairro.trim() : undefined,
          endereco_referencia: checkout.tipo === 'delivery' ? checkout.endereco_referencia.trim() : undefined,
          items: cart.map((c) => ({
            item_id: c.id,
            quantity: c.quantity,
            unit_price: Number(c.price),
            observations: c.user_note || null,
            prato_feito_espetinho_id: c.prato_feito_espetinho_id || null,
            extra_caramelized_onion: c.extra_caramelized_onion ? 1 : 0,
            extra_hamburger: c.extra_hamburger ? 1 : 0
          })),
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `Falha ao enviar pedido (${r.status})`)
      setLastOrder({
        ...data,
        tipo: data.tipo || checkout.tipo,
        status: data.status || 'recebido',
      })
      salvarPedidoLocal(data, checkout.cliente_telefone)
      setPedidoSalvoLocal(lerPedidoLocal())
      setStep('done')
      setIsCartOpen(false)
    } catch (err) {
      setError(err.message || 'Erro ao enviar pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="menu-bg flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 h-11 w-11 animate-spin rounded-full border-4 border-[hsl(var(--menu-primary))] border-t-transparent" />
          <p className="font-display text-lg font-extrabold text-[hsl(var(--menu-fg))]">Carregando cardápio...</p>
        </div>
      </div>
    )
  }

  if (step === 'done' && lastOrder) {
    return (
      <PedidoOnlineAcompanhamento
        orderId={lastOrder.id}
        apiBase={apiBase}
        initialOrder={lastOrder}
        telefoneConsulta={checkout.cliente_telefone}
        onNovoPedido={resetNovoPedido}
      />
    )
  }

  if (!loading && !onlineAtivo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Bosque da Carne</h1>
        <p className="mt-2 text-sm font-medium uppercase tracking-wide text-slate-500">Pedidos online</p>
        <div className="mt-8 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-4xl"></p>
          <h2 className="mt-3 text-xl font-semibold text-amber-900">Indisponível hoje</h2>
          <p className="mt-3 text-base leading-relaxed text-amber-950">{mensagemFechado}</p>
        </div>
        <Link to="/" className="mt-8 text-sm text-slate-600 hover:underline">Voltar ao início</Link>
      </div>
    )
  }

  return (
    <div className="public-menu delivery-menu min-h-screen w-full overflow-x-hidden pb-28 text-slate-900">
      <div className="delivery-top">
        <header className="delivery-header">
          <div className="delivery-heading">
            <h1>Com fome?</h1><span>Peça no Bosque.</span>
          </div>
          <button type="button" onClick={() => setIsCartOpen(true)} className="delivery-cart-button" aria-label={`Carrinho, ${totalItems} itens`}>
            <Icon name="orders" size={20} />{totalItems > 0 && <b>{totalItems}</b>}
          </button>
        </header>
        <label className="delivery-search">
          <Icon name="search" size={16} />
          <input value={menuSearch} onChange={(event) => setMenuSearch(event.target.value)} placeholder="Buscar no cardápio" />
        </label>
        {entregaGratis && (
          <p className="delivery-free">Entrega grátis hoje</p>
        )}
        {step === 'menu' && (
          <nav className="delivery-category-arc" aria-label="Categorias do cardápio">
            <div className="delivery-category-orbit">
              {arcCategories.map((c, index) => {
                const arcStyle = categoryArcStyle(index, arcCategories.length)
                if (!c) return <button type="button" key="all" style={arcStyle} className={`category-all ${activeCatId === 'all' ? 'is-active' : ''}`} onClick={() => setActiveCatId('all')}>
                  <span><Icon name="grid" size={20} /></span><b>Todos</b>
                </button>
                return <button type="button" key={c.id} className={activeCatId === c.id ? 'is-active' : ''} style={arcStyle} onClick={() => setActiveCatId(c.id)}>
                  <span><Icon name={CATEGORY_ICON_BY_SLUG[c.slug] || 'book'} size={20} /></span>
                  <b>{c.name}</b>
                </button>
              })}
            </div>
          </nav>
        )}
      </div>

      {step === 'menu' && (
        <main className="mx-auto mt-5 w-full max-w-5xl px-4">
          {pedidoSalvoLocal?.telefone && (
            <Link
              to="/acompanhar"
              className="mb-4 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-100"
            >
              <span> Acompanhar meu último pedido</span>
              <span className="text-amber-700">Ver →</span>
            </Link>
          )}
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
              <button type="button" onClick={loadMenu} className="ml-2 rounded bg-red-100 px-2 py-1 font-semibold">Tentar novamente</button>
            </div>
          )}

          <section className="delivery-catalog">
            <div className="delivery-catalog-heading">
              <div><span>Escolha o seu</span><h2>{activeCatId === 'all' ? 'Cardápio' : orderedCategories.find((c) => c.id === activeCatId)?.name}</h2></div>
              <small>{visibleMenuItems.length} {visibleMenuItems.length === 1 ? 'opção' : 'opções'}</small>
            </div>
            <div className="delivery-products-grid">
              {visibleMenuItems.map((item) => {
                const n = normalize(item.name)
                const category = orderedCategories.find((c) => c.id === item.category_id)
                const badges = []
                if (n.includes('gado') && n.includes('bacon')) badges.push('Mais pedido')
                if (n.includes('churraspao') || n.includes('prato feito')) badges.push('Favorito')
                return <ProductCard key={item.id} item={item} badges={badges} categoryIcon={CATEGORY_ICON_BY_SLUG[category?.slug] || 'book'} onOpen={openProduct} imageTransitionActive={transitionProductId === item.id && !modalProduct} />
              })}
            </div>
          </section>

          {destaqueCoracaoItem && (
            <section className="mb-8 overflow-hidden rounded-2xl border-2 border-[hsl(var(--menu-primary))] bg-gradient-to-br from-orange-50 via-white to-amber-50/80 shadow-xl ring-1 ring-orange-200/60">
              <div className="grid gap-0 md:grid-cols-2 md:items-stretch">
                <div className="relative aspect-[4/3] min-h-[200px] bg-slate-200 md:min-h-[260px]">
                  {(() => {
                    const { image, imageFallback } = resolvePedirItemImages(destaqueCoracaoItem.name, apiBase)
                    return image ? (
                      <img
                        src={image}
                        alt={destaqueCoracaoItem.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          if (imageFallback && e.currentTarget.src !== imageFallback) {
                            e.currentTarget.src = imageFallback
                          }
                        }}
                      />
                    ) : (
                      <div className="flex h-full min-h-[200px] items-center justify-center bg-slate-100 text-slate-500">Foto em breve</div>
                    )
                  })()}
                </div>
                <div className="flex flex-col justify-center p-5 md:p-8">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Destaque</span>
                  <h2 className="mt-1 font-display text-2xl font-black leading-tight text-[hsl(var(--menu-fg))] md:text-3xl">
                    {destaqueCoracaoItem.name}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700 md:text-base">{textoDescricaoItemPedir(destaqueCoracaoItem)}</p>
                  <p className="mt-4 text-2xl font-black text-[hsl(var(--menu-primary))]">{formatPrice(destaqueCoracaoItem.price)}</p>
                  <button
                    type="button"
                    onClick={() => setModalProduct(destaqueCoracaoItem)}
                    className="mt-5 rounded-xl bg-black py-3.5 text-base font-bold text-white shadow-lg transition hover:opacity-90 active:scale-[0.99]"
                  >
                    Pedir agora
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <span></span>
              <h2 className="text-xl font-semibold">Destaque da Casa</h2>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3">
              {highlightItems.map((item) => (
                <ProductCard
                  key={`highlight-${item.id}`}
                  item={item}
                  highlight
                  badges={normalize(item.name).includes('bacon') ? [' MAIS PEDIDO', ' FAVORITO'] : [' FAVORITO']}
                  onOpen={setModalProduct}
                />
              ))}
            </div>
          </section>

          {combos.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <span></span>
                <h2 className="text-xl font-semibold">Combos</h2>
              </div>
              <div className="space-y-3">
                {combos.map((combo) => <ComboCard key={combo.id} combo={combo} onRequestAddCombo={requestAddCombo} />)}
              </div>
            </section>
          )}

          {orderedCategories.map((cat) => {
            const items = itemsByCategory.get(cat.id) || []
            if (items.length === 0) return null
            return (
              <section id={`cat-${cat.id}`} key={cat.id} className="mb-6 scroll-mt-20">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-xl font-semibold">{cat.name}</h2>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3">
                  {items.map((item) => {
                    const n = normalize(item.name)
                    const badges = []
                    if (n.includes('gado') && n.includes('bacon')) badges.push(' MAIS PEDIDO')
                    if (n.includes('churraspao') || n.includes('prato feito')) badges.push(' FAVORITO')
                    return <ProductCard key={item.id} item={item} badges={badges} highlight={n.includes('churraspao') || n.includes('prato feito')} onOpen={setModalProduct} />
                  })}
                </div>
              </section>
            )
          })}
        </main>
      )}

      {step === 'checkout' && (
        <main className="mx-auto mt-5 w-full max-w-5xl px-4">
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <h3 className="text-xl font-semibold">Seu Pedido ({totalItems})</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {cart.map((c, i) => (
                <li key={`${c.id}-${c.user_note || ''}-${i}`} className="flex justify-between gap-2">
                  <span>{c.quantity}x {c.name}</span>
                  <span className="font-semibold">{formatPrice(c.quantity * c.price)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t pt-3 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Subtotal (itens)</span>
                <span className="font-semibold">{formatPrice(subtotalItens)}</span>
              </div>
              {checkout.tipo === 'delivery' && (
                <div className="flex justify-between text-slate-600">
                  <span>Taxa de entrega</span>
                  <span className={`font-semibold ${taxaEntrega === 0 ? 'text-emerald-600' : ''}`}>
                    {taxaEntrega === 0 ? 'Grátis' : formatPrice(taxaEntrega)}
                  </span>
                </div>
              )}
              <p className="pt-1 text-lg font-bold text-slate-900">Total: {formatPrice(totalPrice)}</p>
            </div>
          </div>

          <form onSubmit={handleSubmitOrder} className="space-y-4">
            {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}
            <input className="w-full rounded-xl border px-4 py-3" placeholder="Nome completo *" required value={checkout.cliente_nome} onChange={(e) => setCheckout((c) => ({ ...c, cliente_nome: e.target.value }))} />
            <input className="w-full rounded-xl border px-4 py-3" placeholder="Telefone / WhatsApp *" required value={checkout.cliente_telefone} onChange={(e) => setCheckout((c) => ({ ...c, cliente_telefone: e.target.value }))} />
            <input className="w-full rounded-xl border px-4 py-3" placeholder="E-mail (opcional)" value={checkout.cliente_email} onChange={(e) => setCheckout((c) => ({ ...c, cliente_email: e.target.value }))} />

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCheckout((c) => ({ ...c, tipo: 'retirada' }))} className={`rounded-xl border px-4 py-3 font-semibold ${checkout.tipo === 'retirada' ? 'border-[hsl(var(--menu-primary))] bg-orange-50' : 'border-slate-300 bg-white'}`}>Retirada</button>
              <button type="button" onClick={() => setCheckout((c) => ({ ...c, tipo: 'delivery' }))} className={`rounded-xl border px-4 py-3 font-semibold ${checkout.tipo === 'delivery' ? 'border-[hsl(var(--menu-primary))] bg-orange-50' : 'border-slate-300 bg-white'}`}>
                Delivery{entregaGratis ? ' · grátis' : ''}
              </button>
            </div>

            {checkout.tipo === 'delivery' && (
              <div className="space-y-2 rounded-2xl border bg-white p-4">
                <input className="w-full rounded-xl border px-4 py-3" placeholder="Rua *" value={checkout.endereco_rua} onChange={(e) => setCheckout((c) => ({ ...c, endereco_rua: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="w-full rounded-xl border px-4 py-3" placeholder="Número *" value={checkout.endereco_numero} onChange={(e) => setCheckout((c) => ({ ...c, endereco_numero: e.target.value }))} />
                  <input className="w-full rounded-xl border px-4 py-3" placeholder="Complemento" value={checkout.endereco_complemento} onChange={(e) => setCheckout((c) => ({ ...c, endereco_complemento: e.target.value }))} />
                </div>
                <input className="w-full rounded-xl border px-4 py-3" placeholder="Bairro *" value={checkout.endereco_bairro} onChange={(e) => setCheckout((c) => ({ ...c, endereco_bairro: e.target.value }))} />
                <input className="w-full rounded-xl border px-4 py-3" placeholder="Referência" value={checkout.endereco_referencia} onChange={(e) => setCheckout((c) => ({ ...c, endereco_referencia: e.target.value }))} />
              </div>
            )}

            <input className="w-full rounded-xl border px-4 py-3" placeholder="Observações (opcional)" value={checkout.observacoes} onChange={(e) => setCheckout((c) => ({ ...c, observacoes: e.target.value }))} />

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Forma de pagamento *</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ['pix', 'PIX'],
                  ['dinheiro', 'Dinheiro'],
                  ['cartao_debito', 'Cartão de débito'],
                  ['cartao_credito', 'Cartão de crédito'],
                  ['vale', 'Vale refeição / alimentação'],
                ].map(([val, lab]) => (
                  <label
                    key={val}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
                      checkout.forma_pagamento === val ? 'border-[hsl(var(--menu-primary))] bg-orange-50' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="forma_pagamento_pedir"
                      value={val}
                      checked={checkout.forma_pagamento === val}
                      onChange={() => setCheckout((c) => ({ ...c, forma_pagamento: val }))}
                      className="h-4 w-4 accent-[hsl(var(--menu-primary))]"
                    />
                    {lab}
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" disabled={submitting} className="w-full rounded-xl bg-black py-4 text-lg font-semibold text-white disabled:opacity-70">
              {submitting ? 'Enviando...' : `Confirmar pedido - ${formatPrice(totalPrice)}`}
            </button>
          </form>
        </main>
      )}

      {modalProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center"
          onClick={() => {
            closeProduct()
          }}
        >
          <div className="delivery-product-modal w-full max-w-md rounded-t-3xl bg-white p-5 shadow-float sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="delivery-modal-close" aria-label="Fechar detalhes" onClick={closeProduct}>×</button>
            <div className={`delivery-modal-hero ${modalProduct.transparent ? `is-transparent image-${productVisualKind(modalProduct.name)}` : ''}`}>
              {modalProduct.image && (
                <img
                  src={modalProduct.image}
                  alt={modalProduct.name}
                  style={transitionProductId === modalProduct.id ? { viewTransitionName: 'delivery-product-image' } : undefined}
                />
              )}
            </div>
            <div className="delivery-modal-summary">
              <span>Direto da brasa</span>
              <h3>{modalProduct.name}</h3>
              <p>{textoDescricaoItemPedir(modalProduct)}</p>
              <strong>{formatPrice(modalUnitWithAddons)}</strong>
            </div>

            {isPratoFeitoItem(modalProduct) && (
              <div className="mt-4">
                <label className="mb-1 block text-sm font-semibold text-slate-700">Escolha o espetinho do Prato Feito *</label>
                <select
                  className="w-full rounded-xl border px-4 py-3"
                  value={modalPfEspetinhoId}
                  onChange={(e) => setModalPfEspetinhoId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {espetinhosOnline.map((esp) => (
                    <option key={esp.id} value={esp.id}>{esp.name}</option>
                  ))}
                </select>
              </div>
            )}

            {!isPratoFeitoItem(modalProduct) && lancheComOpcionaisAdicionais(modalProduct, modalProductCategorySlug) && (
              <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                {itemAceitaCebolaCaramelizada(modalProduct) && (
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                    <input type="checkbox" className="mt-0.5" checked={modalExtraCebola} onChange={(e) => setModalExtraCebola(e.target.checked)} />
                    <span>Cebola caramelizada (+ {formatPrice(PRECO_CEbola_CARAMELIZADA)})</span>
                  </label>
                )}
                {itemAceitaHamburguerExtra(modalProduct) && (
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                    <input type="checkbox" className="mt-0.5" checked={modalExtraBurger} onChange={(e) => setModalExtraBurger(e.target.checked)} />
                    <span>Hambúrguer extra (+ {formatPrice(PRECO_HAMBURGUER_EXTRA)})</span>
                  </label>
                )}
              </div>
            )}

            <input className="mt-4 w-full rounded-xl border px-4 py-3" placeholder="Ponto da carne / observações" value={modalObs} onChange={(e) => setModalObs(e.target.value)} />

            {suggestedItems.length > 0 && (
              <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/60 p-3">
                <p className="mb-2 text-sm font-semibold text-orange-800">Combina com</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedItems.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); addSuggested(s) }}
                      className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-sm font-semibold text-orange-700"
                    >
                      + {s.name} ({formatPrice(s.price)}) {getCartQtyById(s.id) > 0 ? `• ${getCartQtyById(s.id)}x` : ''} {lastSuggestedAddedId === s.id ? '✓' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <div className="flex items-center rounded-xl border">
                <button type="button" className="h-10 w-10 font-bold" onClick={() => setModalQty((q) => Math.max(1, q - 1))}>-</button>
                <span className="w-10 text-center font-bold">{modalQty}</span>
                <button type="button" className="h-10 w-10 font-bold" onClick={() => setModalQty((q) => q + 1)}>+</button>
              </div>
              <button type="button" onClick={addFromModal} className="flex-1 rounded-xl bg-black py-3 font-semibold text-white">
                Adicionar - {formatPrice(modalUnitWithAddons * modalQty)}
              </button>
            </div>
          </div>
        </div>
      )}

      {comboModal && (() => {
        const pfIdx = Array.isArray(comboModal.pfSlots) && comboModal.pfSlots.length > 0
          ? comboModal.pfSlots
          : comboModal.products.map((p, i) => i).filter((i) => isPratoFeitoItem(comboModal.products[i]))
        return (
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 sm:items-center"
            onClick={() => { setComboModal(null); setComboPfSelections({}) }}
          >
            <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-float sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-2xl font-semibold">{comboModal.emoji} {comboModal.name}</h3>
              <p className="mt-1 text-sm text-slate-600">Para cada Prato Feito do combo, escolha o espetinho (obrigatório no caixa).</p>
              {pfIdx.map((productIndex, j) => (
                <div key={productIndex} className="mt-4">
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    Espetinho do Prato Feito{pfIdx.length > 1 ? ` (${j + 1}/${pfIdx.length})` : ''} *
                  </label>
                  <select
                    className="w-full rounded-xl border px-4 py-3"
                    value={comboPfSelections[productIndex] ?? ''}
                    onChange={(e) => setComboPfSelections((s) => ({ ...s, [productIndex]: e.target.value }))}
                  >
                    <option value="">Selecione</option>
                    {espetinhosOnline.map((esp) => (
                      <option key={esp.id} value={esp.id}>{esp.name}</option>
                    ))}
                  </select>
                </div>
              ))}
              {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-slate-300 py-3 font-semibold text-slate-700"
                  onClick={() => { setError(''); setComboModal(null); setComboPfSelections({}) }}
                >
                  Cancelar
                </button>
                <button type="button" className="flex-1 rounded-xl bg-black py-3 font-semibold text-white" onClick={confirmComboModal}>
                  Adicionar combo - {formatPrice(comboModal.price)}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/45" onClick={() => setIsCartOpen(false)}>
          <aside
            className="absolute right-0 top-0 flex h-full min-h-0 w-full max-w-md flex-col bg-white shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-4">
              <h3 className="text-2xl font-semibold">Seu Pedido ({totalItems})</h3>
              <button type="button" onClick={() => setIsCartOpen(false)} className="rounded-lg border px-3 py-1">X</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3 [-webkit-overflow-scrolling:touch]">
              {cart.length === 0 && <p className="text-slate-600">Carrinho vazio.</p>}
              {cart.length > 0 && (
                <div className="space-y-2">
                  {cart.map((item, i) => (
                    <div
                      key={`${item.id}-${item.user_note || ''}-${item.prato_feito_espetinho_id || ''}-${item.extra_caramelized_onion ? '1' : '0'}-${item.extra_hamburger ? '1' : '0'}-${i}`}
                      className="rounded-xl border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{item.name}</p>
                        <p className="font-bold">{formatPrice(item.price * item.quantity)}</p>
                      </div>
                      {item.user_note && <p className="mt-1 text-xs text-slate-500">{item.user_note}</p>}
                      {(item.extra_caramelized_onion || item.extra_hamburger) && (
                        <p className="mt-1 text-xs font-medium text-emerald-800">
                          {item.extra_caramelized_onion ? `+ cebola caramelizada (${formatPrice(PRECO_CEbola_CARAMELIZADA)})` : ''}
                          {item.extra_caramelized_onion && item.extra_hamburger ? ' · ' : ''}
                          {item.extra_hamburger ? `+ hambúrguer extra (${formatPrice(PRECO_HAMBURGUER_EXTRA)})` : ''}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="h-9 w-9 rounded-full border font-bold"
                          onClick={() =>
                            updateQty(item.id, item.user_note, item.prato_feito_espetinho_id, item.extra_caramelized_onion, item.extra_hamburger, -1)
                          }
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          className="h-9 w-9 rounded-full border font-bold"
                          onClick={() =>
                            updateQty(item.id, item.user_note, item.prato_feito_espetinho_id, item.extra_caramelized_onion, item.extra_hamburger, 1)
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div className="shrink-0 space-y-1 border-t border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal (itens)</span>
                  <span className="font-semibold">{formatPrice(subtotalItens)}</span>
                </div>
                {checkout.tipo === 'delivery' && (
                  <div className="flex justify-between">
                    <span>Taxa de entrega</span>
                    <span className={`font-semibold ${taxaEntrega === 0 ? 'text-emerald-600' : ''}`}>
                      {taxaEntrega === 0 ? 'Grátis' : formatPrice(taxaEntrega)}
                    </span>
                  </div>
                )}
                <p className="pt-1 text-xl font-semibold text-slate-900">Total: {formatPrice(totalPrice)}</p>
                <button type="button" onClick={() => { setIsCartOpen(false); setStep('checkout') }} className="mt-3 w-full rounded-xl bg-black py-3 font-semibold text-white">
                  Finalizar pedido
                </button>
                <button type="button" onClick={clearCart} className="mt-2 w-full rounded-xl border border-slate-300 py-2.5 font-semibold text-slate-700">
                  Limpar carrinho
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {step === 'menu' && totalItems > 0 && (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 z-40 rounded-2xl bg-black px-4 py-3 text-left text-white shadow-float"
        >
          <span className="text-sm font-semibold">{totalItems} itens</span>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-lg font-semibold">Ver carrinho</span>
            <span className="text-lg font-semibold">{formatPrice(totalPrice)}</span>
          </div>
          {checkout.tipo === 'delivery' && taxaEntrega === 0 && (
            <p className="mt-1 text-xs font-medium text-emerald-300">Entrega grátis hoje</p>
          )}
          {taxaEntrega > 0 && (
            <p className="mt-1 text-xs font-medium text-white/80">Inclui taxa de entrega ({formatPrice(taxaEntrega)})</p>
          )}
        </button>
      )}
    </div>
  )
}

