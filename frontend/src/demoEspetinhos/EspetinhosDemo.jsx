import { useEffect, useMemo, useRef, useState } from 'react'
import CategoryArc from './CategoryArc'
import { demoCategories, demoSkewers } from './demoData'
import { runDemoTransition } from './useDemoTransition'
import Icon from '../components/Icon'
import './espetinhosDemo.css'

const money = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function EspetinhosDemo() {
  const [activeCategory, setActiveCategory] = useState('todos')
  const [selectedId, setSelectedId] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [meatPoint, setMeatPoint] = useState('Ao ponto')
  const [cartCount, setCartCount] = useState(0)
  const [added, setAdded] = useState(false)
  const [categoryVersion, setCategoryVersion] = useState(0)
  const addedTimer = useRef(null)

  const selected = demoSkewers.find(item => item.id === selectedId) || null
  const visible = useMemo(() => activeCategory === 'todos'
    ? demoSkewers
    : demoSkewers.filter(item => item.category === activeCategory), [activeCategory])

  useEffect(() => {
    const previous = document.title
    document.title = 'Espetinhos em movimento · Bosque da Carne'
    return () => { document.title = previous; clearTimeout(addedTimer.current) }
  }, [])

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape' && selectedId) {
        const returningId = selectedId
        runDemoTransition(() => setSelectedId(null)).then(() => {
          document.querySelector(`[data-skewer-id="${returningId}"]`)?.focus()
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const chooseCategory = id => runDemoTransition(() => {
    setActiveCategory(id)
    setCategoryVersion(value => value + 1)
  })

  const openDetails = item => {
    setQuantity(1)
    setMeatPoint('Ao ponto')
    setAdded(false)
    runDemoTransition(() => setSelectedId(item.id))
  }

  const closeDetails = () => {
    const returningId = selectedId
    runDemoTransition(() => setSelectedId(null)).then(() => {
      document.querySelector(`[data-skewer-id="${returningId}"]`)?.focus()
    })
  }

  const addToCart = () => {
    setCartCount(value => value + quantity)
    setAdded(true)
    clearTimeout(addedTimer.current)
    addedTimer.current = setTimeout(() => setAdded(false), 2200)
  }

  return <main className={`skewer-demo ${selected ? 'is-detail' : ''}`}>
    <div className="skewer-demo-shell">
      {!selected ? <>
        <header className="skewer-home-header">
          <div className="skewer-home-title"><strong>Com fome?</strong> <span>Peça no Bosque.</span></div>
          <button className={`skewer-cart ${cartCount ? 'has-items' : ''}`} type="button" aria-label={`Carrinho, ${cartCount} itens`}>
            <Icon name="orders" size={20} />{cartCount > 0 && <b>{cartCount}</b>}
          </button>
        </header>

        <div className="skewer-search"><Icon name="search" size={16} /><span>Buscar espetinho</span></div>

        <CategoryArc categories={demoCategories} activeId={activeCategory} onSelect={chooseCategory} />

        <section className="skewer-showcase" aria-live="polite">
          <div className="skewer-section-heading"><div><span>Escolha o seu</span><h2>Espetinhos</h2></div><small>{visible.length} {visible.length === 1 ? 'opção' : 'opções'}</small></div>
          <div className="skewer-grid" key={categoryVersion}>
            {visible.map((item, index) => <button
              type="button" className="skewer-product" key={item.id}
              style={{ '--card-delay': `${index * 70}ms` }}
              data-skewer-id={item.id}
              onClick={() => openDetails(item)}
              aria-label={`Abrir ${item.name}, ${money(item.price)}`}
            >
              <span className="skewer-image-space">
                <img src={item.image} alt="" style={{ viewTransitionName: `skewer-${item.id}` }} />
                <i aria-hidden="true" />
              </span>
              <span className="skewer-product-copy"><strong>{item.shortName}</strong><small>{item.description}</small><b>{money(item.price)}</b></span>
              <span className="skewer-plus" aria-hidden="true">+</span>
            </button>)}
          </div>
        </section>
        <p className="skewer-demo-label">Demonstração visual · nenhum pedido será enviado</p>
      </> : <section className="skewer-detail" aria-labelledby="skewer-detail-title">
        <header className="skewer-detail-header">
          <button type="button" onClick={closeDetails} aria-label="Voltar aos espetinhos"><Icon name="arrow" size={19} /></button>
          <button type="button" aria-label="Favoritar produto" className="skewer-heart">♡</button>
        </header>

        <div className="skewer-detail-visual">
          <div className="skewer-hero-copy">
            <p>Espetinho do Bosque</p>
            <h1 id="skewer-detail-title">{selected.name}</h1>
            <small>{selected.description.split(',')[0]}</small>
            <div className="skewer-rating"><b>★ ★ ★ ★ ★</b> <span>(4,8)</span></div>
            <strong>{money(selected.price)}</strong>
            <dl><div><dt>Preparo</dt><dd>Na brasa</dd></div><div><dt>Porção</dt><dd>1 espetinho</dd></div></dl>
          </div>
          <div className="skewer-glow" aria-hidden="true" />
          <img src={selected.image} alt={selected.name} style={{ viewTransitionName: `skewer-${selected.id}` }} />
        </div>

        <div className="skewer-detail-copy">
          {selected.asksPoint && <fieldset className="skewer-point skewer-reveal step-5">
            <legend>Ponto da carne</legend>
            <div>{['Malpassado', 'Ao ponto', 'Bem passado'].map(point => <button
              type="button" key={point} onClick={() => setMeatPoint(point)}
              aria-pressed={meatPoint === point}
            >{point}</button>)}</div>
          </fieldset>}
          <div className="skewer-extras skewer-reveal step-5">
            <span>Farofa</span><span>Vinagrete</span><span>Molho da casa</span>
          </div>
          <p className="skewer-description skewer-reveal step-4">Preparado na hora, com o sabor da churrasqueira do Bosque da Carne.</p>
        </div>

        <div className="skewer-order-bar skewer-reveal step-6">
          <div className="skewer-quantity" aria-label="Quantidade">
            <button type="button" onClick={() => setQuantity(value => Math.max(1, value - 1))} aria-label="Diminuir quantidade">−</button>
            <output>{quantity}</output>
            <button type="button" onClick={() => setQuantity(value => value + 1)} aria-label="Aumentar quantidade">+</button>
          </div>
          <button type="button" className={`skewer-add ${added ? 'is-added' : ''}`} onClick={addToCart}>
            <span>{added ? 'Adicionado' : 'Adicionar'}</span><strong>{money(selected.price * quantity)}</strong>
          </button>
        </div>
        <p className="skewer-demo-label">Demonstração visual · nenhum pedido será enviado</p>
      </section>}
    </div>
  </main>
}
