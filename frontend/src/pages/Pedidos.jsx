import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCategories, getItems, getEspetinhos, createPedido, getPedidosByComanda, deletePedido, updatePedido, getComanda, updateComanda } from '../api'
import {
  lancheComOpcionaisAdicionais,
  itemAceitaCebolaCaramelizada,
  itemAceitaHamburguerExtra,
  textoResumoAddonsPedido,
  PRECO_CEbola_CARAMELIZADA,
  PRECO_HAMBURGUER_EXTRA
} from '../utils/lancheAddons'

const MEAT_POINTS = ['mal passado', 'ao ponto', 'bem passado']
const CAIPIRINHA_BASES = ['Cachaça', 'Vodka']
const DOSE_ACCOMPANIMENTS = ['Gelo de coco']
/** Doses vendidas avulso (sem modal de acompanhamento) — preço do próprio item */
const DOSE_STANDALONE_NAMES = new Set(['Red Bull', 'Coca-Cola 350ml'])

export default function Pedidos() {
  const { comandaId } = useParams()
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [espetinhos, setEspetinhos] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [view, setView] = useState('categories') // categories | items | revisao | comanda
  const [, setCategoryId] = useState(null)
  const [currentCategory, setCurrentCategory] = useState(null)
  const [modal, setModal] = useState(null) // { item, quantity, step: 'meat'|'prato_feito'|'caipirinha'|'dose'|'confirm' }
  const [errorMessage, setErrorMessage] = useState('')
  // Rascunho do pedido antes de enviar (cada linha = um item a ser enviado)
  const [rascunho, setRascunho] = useState([]) // inclui observations (descrição livre: sabor promo, etc.)
  const [editRascunhoIndex, setEditRascunhoIndex] = useState(null) // índice da linha em edição na tela de revisão
  const [editPedidoModal, setEditPedidoModal] = useState(null) // { id, quantity, observations } para alterar item já enviado
  const [comanda, setComanda] = useState(null)
  const [modalTrocarMesa, setModalTrocarMesa] = useState(null) // null | { novaMesa: string }
  const [enviandoRascunho, setEnviandoRascunho] = useState(false)

  const loadComanda = async () => {
    if (!comandaId) return
    try {
      const c = await getComanda(Number(comandaId))
      setComanda(c)
    } catch {
      setComanda(null)
    }
  }

  const loadCategories = async () => {
    const list = await getCategories()
    setCategories(
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name), 'pt-BR'))
    )
  }
  const loadItems = async (cid) => {
    const list = await getItems(cid)
    setItems(list)
  }
  const loadEspetinhos = async () => {
    const list = await getEspetinhos()
    setEspetinhos(list)
  }
  const loadPedidos = async () => {
    const list = await getPedidosByComanda(Number(comandaId))
    setPedidos(list)
  }

  useEffect(() => { loadCategories(); loadEspetinhos() }, [])
  useEffect(() => { if (comandaId) { loadPedidos(); loadComanda() } }, [comandaId])

  const openCategory = (cat) => {
    setCategoryId(cat.id)
    setCurrentCategory(cat)
    loadItems(cat.id)
    setView('items')
  }

  const addItem = (item, qty = 1) => {
    const needMeat = item.requires_meat_point === 1 || currentCategory?.slug === 'lanches'
    const needPratoFeito = item.is_prato_feito === 1
    const needCaipirinha = currentCategory?.slug === 'caipirinhas'
    const needDose = currentCategory?.slug === 'doses'
    if (needPratoFeito) {
      setModal({ item, quantity: qty, step: 'prato_feito', observations: '' })
      return
    }
    if (needMeat) {
      if (lancheComOpcionaisAdicionais(item, currentCategory?.slug)) {
        setModal({
          item,
          quantity: qty,
          step: 'meat',
          meat_point: 'ao ponto',
          extra_caramelized_onion: false,
          extra_hamburger: false,
          observations: ''
        })
        return
      }
      setModal({ item, quantity: qty, step: 'meat', observations: '' })
      return
    }
    if (needCaipirinha) {
      setModal({ item, quantity: qty, step: 'caipirinha', observations: '' })
      return
    }
    if (needDose && !DOSE_STANDALONE_NAMES.has(item.name)) {
      setModal({ item, quantity: qty, step: 'dose', observations: '' })
      return
    }
    setModal({ item, quantity: qty, step: 'confirm', observations: '' })
  }

  const getTipo = (opts) => {
    if (opts.prato_feito_espetinho_id != null) return 'prato_feito'
    if (opts.meat_point != null) return 'meat'
    if (opts.caipirinha_base != null) return 'caipirinha'
    if (opts.dose_accompaniment !== undefined) return 'dose'
    return 'simple'
  }

  const addToDraft = (opts, replaceIndex = null) => {
    const { item, quantity, meat_point, caipirinha_base, caipirinha_picole, dose_accompaniment, prato_feito_espetinho_id, observations, extra_caramelized_onion, extra_hamburger } = opts
    const prato_feito_espetinho_name = prato_feito_espetinho_id != null
      ? (espetinhos.find((e) => e.id === prato_feito_espetinho_id)?.name || '')
      : undefined
    const line = {
      id: replaceIndex !== null ? rascunho[replaceIndex].id : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      item,
      quantity,
      meat_point: meat_point || undefined,
      caipirinha_base: caipirinha_base || undefined,
      caipirinha_picole: caipirinha_picole ?? false,
      dose_accompaniment: dose_accompaniment || undefined,
      prato_feito_espetinho_id: prato_feito_espetinho_id || undefined,
      prato_feito_espetinho_name,
      observations: (observations && String(observations).trim()) || undefined,
      extra_caramelized_onion: !!extra_caramelized_onion,
      extra_hamburger: !!extra_hamburger,
      tipo: getTipo(opts)
    }
    setModal(null)
    setEditRascunhoIndex(null)
    if (replaceIndex !== null) {
      setRascunho((prev) => prev.map((r, i) => (i === replaceIndex ? line : r)))
    } else {
      setRascunho((prev) => [...prev, line])
    }
  }


  const sendPedido = async (opts) => {
    const { item, quantity, meat_point, caipirinha_base, caipirinha_picole, dose_accompaniment, prato_feito_espetinho_id, observations, extra_caramelized_onion, extra_hamburger } = opts
    const cid = Number(comandaId)
    if (!Number.isFinite(cid) || cid < 1) throw new Error('Comanda inválida')
    const iid = Number(item?.id)
    if (!Number.isFinite(iid) || iid < 1) throw new Error('Item inválido')
    const q = Math.max(1, Math.min(999, parseInt(String(quantity ?? 1), 10) || 1))
    await createPedido({
      comanda_id: cid,
      item_id: iid,
      quantity: q,
      meat_point: meat_point || undefined,
      caipirinha_base: caipirinha_base || undefined,
      caipirinha_picole: caipirinha_picole ? 1 : 0,
      dose_accompaniment: dose_accompaniment || undefined,
      prato_feito_espetinho_id: prato_feito_espetinho_id != null ? Number(prato_feito_espetinho_id) || undefined : undefined,
      observations: observations && String(observations).trim() ? String(observations).trim() : undefined,
      extra_caramelized_onion: extra_caramelized_onion ? 1 : 0,
      extra_hamburger: extra_hamburger ? 1 : 0
    })
  }

  const enviarRascunho = async () => {
    if (rascunho.length === 0 || enviandoRascunho) return
    setErrorMessage('')
    setEnviandoRascunho(true)
    try {
      const payloads = rascunho.map((line) => ({
        item: line.item,
        quantity: line.quantity,
        meat_point: line.meat_point,
        caipirinha_base: line.caipirinha_base,
        caipirinha_picole: line.caipirinha_picole,
        dose_accompaniment: line.dose_accompaniment,
        prato_feito_espetinho_id: line.prato_feito_espetinho_id,
        observations: line.observations,
        extra_caramelized_onion: line.extra_caramelized_onion,
        extra_hamburger: line.extra_hamburger
      }))
      await Promise.all(payloads.map((p) => sendPedido(p)))
      setRascunho([])
      setView('categories')
      setCategoryId(null)
      await loadPedidos()
    } catch (e) {
      const msg = e?.message || 'Falha ao enviar pedido'
      setErrorMessage(msg)
      setTimeout(() => setErrorMessage(''), 8000)
    } finally {
      setEnviandoRascunho(false)
    }
  }

  /** Na revisão, o botão fixo confirma o envio; fora dela, abre a tela de revisão. */
  const footerRascunhoAction = () => {
    if (rascunho.length === 0) return
    if (view === 'revisao') enviarRascunho()
    else setView('revisao')
  }

  const totalItens = pedidos.reduce((s, p) => s + (p.quantity || 1), 0) + rascunho.reduce((s, r) => s + (r.quantity || 1), 0)

  /** Coluna esquerda: bebidas/bar; coluna direita: comidas. */
  const BEBIDAS_SLUGS = ['bebidas', 'caipirinhas', 'chopp-cerveja', 'doses', 'drinks']
  const { categoriasBebidas, categoriasComidas } = useMemo(() => {
    const sort = (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
    const bebidas = categories.filter((c) => BEBIDAS_SLUGS.includes(c.slug)).sort(sort)
    const comidas = categories.filter((c) => !BEBIDAS_SLUGS.includes(c.slug)).sort(sort)
    return { categoriasBebidas: bebidas, categoriasComidas: comidas }
  }, [categories])

  // Agrupa linhas de rascunho com mesmo item/opções, ignorando diferenças de ponto da carne (Map = ordem estável; objeto com chaves numéricas quebra ordem)
  const gruposRascunho = useMemo(() => {
    const map = new Map()
    const order = []
    rascunho.forEach((line, index) => {
      const key = [
        line.item?.id || '',
        line.prato_feito_espetinho_id || '',
        line.caipirinha_base || '',
        line.caipirinha_picole ? '1' : '0',
        line.dose_accompaniment || '',
        line.observations || '',
        line.extra_caramelized_onion ? '1' : '0',
        line.extra_hamburger ? '1' : '0'
      ].join('\x1e')
      if (!map.has(key)) {
        map.set(key, {
          ...line,
          quantity: 0,
          indices: [],
          meatPoints: {}
        })
        order.push(key)
      }
      const g = map.get(key)
      g.quantity += Number(line.quantity) || 1
      g.indices.push(index)
      if (line.meat_point) {
        g.meatPoints[line.meat_point] = (g.meatPoints[line.meat_point] || 0) + (Number(line.quantity) || 1)
      }
    })
    return order.map((k) => map.get(k))
  }, [rascunho])

  const descricaoPrincipal = (line) => line.item?.name || ''

  const descricaoDetalhes = (line) => {
    const parts = []
    if (line.prato_feito_espetinho_name) parts.push(`com ${line.prato_feito_espetinho_name}`)

    if (line.meatPoints && Object.keys(line.meatPoints).length) {
      const pontos = Object.keys(line.meatPoints)
      let textoPontos = ''
      if (pontos.length === 1) {
        textoPontos = pontos[0]
      } else {
        textoPontos = `${pontos.slice(0, -1).join(', ')} e ${pontos[pontos.length - 1]}`
      }
      parts.push(textoPontos)
    } else if (line.meat_point) {
      parts.push(line.meat_point)
    }

    if (line.caipirinha_base) parts.push(line.caipirinha_base + (line.caipirinha_picole ? ' c/ picolé' : ''))
    if (line.dose_accompaniment) parts.push(line.dose_accompaniment)
    if (line.extra_caramelized_onion) parts.push(`cebola caramelizada (+R$ ${PRECO_CEbola_CARAMELIZADA.toFixed(2).replace('.', ',')})`)
    if (line.extra_hamburger) parts.push(`hambúrguer extra (+R$ ${PRECO_HAMBURGUER_EXTRA.toFixed(2).replace('.', ',')})`)
    if (line.observations) parts.push(line.observations)
    return parts.join(' · ')
  }

  const removeGrupo = (indices) => {
    const idxSet = new Set(indices)
    setRascunho((prev) => prev.filter((_, i) => !idxSet.has(i)))
    setEditRascunhoIndex(null)
  }

  const changeGroupQuantity = (group, delta) => {
    if (!delta) return
    setRascunho((prev) => {
      if (!group.indices || group.indices.length === 0) return prev
      const next = [...prev]
      if (delta > 0) {
        const i = group.indices[group.indices.length - 1]
        const line = { ...next[i], quantity: (next[i].quantity || 1) + 1 }
        next[i] = line
        return next
      }
      // delta < 0
      for (let k = group.indices.length - 1; k >= 0; k -= 1) {
        const idx = group.indices[k]
        if (!next[idx]) continue
        const q = (next[idx].quantity || 1) - 1
        if (q > 0) {
          next[idx] = { ...next[idx], quantity: q }
          return next
        }
        next.splice(idx, 1)
      }
      return next
    })
  }

  const openEditRascunho = (index) => {
    const line = rascunho[index]
    const item = line.item
    setEditRascunhoIndex(index)
    const base = {
      item,
      quantity: line.quantity,
      meat_point: line.meat_point,
      caipirinha_base: line.caipirinha_base,
      caipirinha_picole: line.caipirinha_picole,
      dose_accompaniment: line.dose_accompaniment,
      prato_feito_espetinho_id: line.prato_feito_espetinho_id,
      observations: line.observations || '',
      extra_caramelized_onion: !!line.extra_caramelized_onion,
      extra_hamburger: !!line.extra_hamburger
    }
    if (line.tipo === 'prato_feito') {
      setModal({ ...base, step: 'prato_feito' })
    } else if (line.tipo === 'meat') {
      setModal({ ...base, step: 'meat' })
    } else if (line.tipo === 'caipirinha') {
      setModal({ ...base, step: 'caipirinha' })
    } else if (line.tipo === 'dose') {
      setModal({ ...base, step: 'dose' })
    } else {
      setModal({ ...base, step: 'confirm' })
    }
  }

  const handleExcluirPedido = async (id) => {
    if (!window.confirm('Excluir este item da comanda? Ele será cancelado na cozinha/bar.')) return
    setErrorMessage('')
    try {
      await deletePedido(id)
      await loadPedidos()
    } catch (e) {
      setErrorMessage(e.message || 'Falha ao excluir')
    }
  }

  const handleSaveEditPedido = async () => {
    if (!editPedidoModal || editPedidoModal.quantity < 1) return
    setErrorMessage('')
    try {
      await updatePedido(editPedidoModal.id, {
        quantity: Math.max(1, parseInt(editPedidoModal.quantity, 10) || 1),
        observations: editPedidoModal.observations.trim() || null
      })
      setEditPedidoModal(null)
      await loadPedidos()
    } catch (e) {
      setErrorMessage(e.message || 'Falha ao alterar')
    }
  }

  const salvarMesa = async () => {
    const v = (modalTrocarMesa?.novaMesa ?? '').trim()
    if (!v) return
    setErrorMessage('')
    try {
      await updateComanda(Number(comandaId), { mesa: v })
      await loadComanda()
      setModalTrocarMesa(null)
    } catch (e) {
      setErrorMessage(e.message || 'Falha ao alterar mesa')
    }
  }

  return (
    <div className="pb-24">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (view === 'categories') {
              navigate('/garcons')
            } else if (view === 'comanda') {
              setView('categories')
            } else {
              setView('categories')
              setCategoryId(null)
              setCurrentCategory(null)
              setEditRascunhoIndex(null)
            }
          }}
        >
          ← Voltar
        </button>
        <span className="font-semibold text-slate-800">
          Comanda {comandaId}
          {comanda?.mesa && <span className="ml-2 text-slate-500 font-normal">— Mesa {comanda.mesa}</span>}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-info text-sm"
            onClick={() => setModalTrocarMesa({ novaMesa: comanda?.mesa ?? '' })}
          >
            Trocar mesa
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-600"
            onClick={() => { setView('comanda'); loadPedidos() }}
          >
            Ver comanda
          </button>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">{totalItens} itens</span>
        </div>
      </div>

      {modalTrocarMesa !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-bold text-slate-800">Trocar número da mesa</h3>
            <input
              type="text"
              placeholder="Número da mesa"
              value={modalTrocarMesa.novaMesa}
              onChange={(e) => setModalTrocarMesa((m) => ({ ...m, novaMesa: e.target.value }))}
              className="mb-4 w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-slate-800"
              onKeyDown={(e) => e.key === 'Enter' && salvarMesa()}
            />
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary flex-1" onClick={() => setModalTrocarMesa(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary flex-1" onClick={salvarMesa}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {view === 'comanda' && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-amber-600">Comanda da mesa — itens enviados</h2>
          <p className="text-sm text-slate-500">Altere quantidade, descrição ou exclua um item já enviado.</p>
          {pedidos.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
              Nenhum item enviado nesta comanda ainda.
            </div>
          ) : (
            <ul className="space-y-2">
              {pedidos.map((p) => {
                const addLab = textoResumoAddonsPedido(p)
                return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-slate-800">
                      {p.quantity}x {p.item_name}
                      {addLab ? <span className="font-semibold text-emerald-700">{addLab}</span> : null}
                    </span>
                    {(p.meat_point || p.caipirinha_base || p.dose_accompaniment || p.prato_feito_espetinho_id) && (
                      <span className="ml-2 text-xs text-amber-700">
                        {[p.meat_point, p.caipirinha_base, p.dose_accompaniment].filter(Boolean).join(' · ')}
                        {p.prato_feito_espetinho_id ? ' (Prato Feito)' : ''}
                      </span>
                    )}
                    {p.observations && <p className="text-xs text-slate-600 mt-0.5 font-medium">Descrição: {p.observations}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className="btn btn-info rounded-lg px-3 py-1.5 text-xs font-medium" onClick={() => setEditPedidoModal({ id: p.id, quantity: p.quantity, observations: p.observations || '' })}>
                      Alterar
                    </button>
                    <button type="button" className="btn btn-danger rounded-lg px-3 py-1.5 text-xs font-medium" onClick={() => handleExcluirPedido(p.id)}>
                      Excluir
                    </button>
                  </div>
                </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {view === 'revisao' && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-amber-600">Revisão do pedido</h2>
          <p className="text-sm text-slate-500">
            Confira os itens e altere se precisar. Toque em <strong>Enviar pedido</strong> (aqui ou no botão fixo no rodapé) para lançar na cozinha/bar/churrasqueira.
          </p>
          {rascunho.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
              Nenhum item no pedido. Volte e adicione itens.
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {gruposRascunho.map((group) => {
                  const detalhes = descricaoDetalhes(group)
                  const isPratoFeito = group.tipo === 'prato_feito'
                  return (
                    <li
                      key={group.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center justify-center rounded-md bg-slate-100 px-2 py-1">
                          <span className="text-sm font-semibold text-amber-600 leading-none">{group.quantity}x</span>
                          <span className="text-[10px] text-slate-500 leading-tight">qtd</span>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-800">
                            {descricaoPrincipal(group)}
                          </span>
                          {detalhes && (
                            <span className="mt-0.5 block text-xs font-medium text-amber-700">
                              {detalhes}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!isPratoFeito && (
                          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100">
                            <button
                              type="button"
                              className="px-2 py-1 text-base font-bold text-slate-700 hover:bg-slate-200 rounded-l-lg"
                              onClick={() => changeGroupQuantity(group, -1)}
                            >
                              −
                            </button>
                            <span className="min-w-[2rem] text-center text-sm font-semibold text-amber-600">
                              {group.quantity}
                            </span>
                            <button
                              type="button"
                              className="px-2 py-1 text-base font-bold text-slate-700 hover:bg-slate-200 rounded-r-lg"
                              onClick={() => changeGroupQuantity(group, 1)}
                            >
                              +
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                            isPratoFeito ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                          }`}
                          onClick={() => openEditRascunho(group.indices[0])}
                        >
                          {isPratoFeito ? 'Editar espetinho/ponto' : 'Alterar'}
                        </button>
                        {isPratoFeito && (
                          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100">
                            <button
                              type="button"
                              className="px-2 py-1 text-base font-bold text-slate-700 hover:bg-slate-200 rounded-l-lg"
                              onClick={() => changeGroupQuantity(group, -1)}
                            >
                              −
                            </button>
                            <span className="min-w-[2rem] text-center text-sm font-semibold text-amber-600">
                              {group.quantity}
                            </span>
                            <button
                              type="button"
                              className="px-2 py-1 text-base font-bold text-slate-700 hover:bg-slate-200 rounded-r-lg"
                              onClick={() => changeGroupQuantity(group, 1)}
                            >
                              +
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                          onClick={() => removeGrupo(group.indices)}
                        >
                          Remover
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                className="btn btn-success w-full py-4 text-lg font-semibold disabled:opacity-60"
                disabled={enviandoRascunho}
                onClick={enviarRascunho}
              >
                {enviandoRascunho ? 'Enviando…' : 'Enviar pedido'}
              </button>
            </>
          )}
        </div>
      )}

      {view === 'categories' && (
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bebidas</h2>
            <div className="grid gap-3">
              {categoriasBebidas.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => openCategory(cat)}
                  className="flex min-h-[4.5rem] items-center justify-center rounded-xl border border-slate-200 bg-white p-4 text-center font-semibold text-slate-800 shadow-sm transition hover:border-amber-400 hover:bg-slate-50"
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Comidas</h2>
            <div className="grid gap-3">
              {categoriasComidas.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => openCategory(cat)}
                  className="flex min-h-[4.5rem] items-center justify-center rounded-xl border border-slate-200 bg-white p-4 text-center font-semibold text-slate-800 shadow-sm transition hover:border-amber-400 hover:bg-slate-50"
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'items' && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => addItem(item)}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-400 hover:bg-slate-50"
            >
              <span className="font-medium text-slate-800">{item.name}</span>
              <span className="text-amber-600">R$ {Number(item.price).toFixed(2).replace('.', ',')}</span>
            </button>
          ))}
        </div>
      )}

      {/* Modal flux: prato_feito -> choose espetinho -> meat (if espetinho has meat) -> send. meat -> send. caipirinha -> send. dose -> send. */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="mb-3 font-semibold text-slate-800">{modal.item?.name} × {modal.quantity}</h3>

            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Descrição (opcional)</label>
              <textarea
                rows={2}
                value={modal.observations ?? ''}
                onChange={(e) => setModal((m) => (m ? { ...m, observations: e.target.value } : null))}
                placeholder="Ex.: promo — sabor limão; sem gelo…"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
              />
            </div>

            {modal.step === 'prato_feito' && (
              <>
                <p className="mb-3 text-sm text-slate-500">Escolha o espetinho do Prato Feito</p>
                <div className="space-y-2">
                  {espetinhos.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 text-left px-3 text-slate-800 hover:bg-slate-100"
                      onClick={() => {
                        if (e.requires_meat_point === 1) {
                          setModal({ ...modal, prato_feito_espetinho_id: e.id, step: 'meat' })
                        } else {
                          addToDraft({ ...modal, prato_feito_espetinho_id: e.id }, editRascunhoIndex)
                        }
                      }}
                    >
                      {e.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {modal.step === 'meat' && (
              <>
                <p className="mb-3 text-sm text-slate-500">Ponto da carne</p>
                {lancheComOpcionaisAdicionais(modal.item, currentCategory?.slug) ? (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {MEAT_POINTS.map((pt) => (
                        <button
                          key={pt}
                          type="button"
                          className={`rounded-lg px-3 py-2 text-sm font-medium ${
                            modal.meat_point === pt ? 'bg-amber-500 text-white' : 'border border-slate-200 bg-slate-50 text-slate-800'
                          }`}
                          onClick={() => setModal((m) => (m ? { ...m, meat_point: pt } : null))}
                        >
                          {pt}
                        </button>
                      ))}
                    </div>
                    {itemAceitaCebolaCaramelizada(modal.item) && (
                      <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={!!modal.extra_caramelized_onion}
                          onChange={(e) => setModal((m) => (m ? { ...m, extra_caramelized_onion: e.target.checked } : null))}
                        />
                        <span>Cebola caramelizada (+ R$ {PRECO_CEbola_CARAMELIZADA.toFixed(2).replace('.', ',')})</span>
                      </label>
                    )}
                    {itemAceitaHamburguerExtra(modal.item) && (
                      <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={!!modal.extra_hamburger}
                          onChange={(e) => setModal((m) => (m ? { ...m, extra_hamburger: e.target.checked } : null))}
                        />
                        <span>Hambúrguer extra (+ R$ {PRECO_HAMBURGUER_EXTRA.toFixed(2).replace('.', ',')})</span>
                      </label>
                    )}
                    <button
                      type="button"
                      className="btn btn-success w-full"
                      disabled={!modal.meat_point}
                      onClick={() =>
                        addToDraft(
                          {
                            ...modal,
                            meat_point: modal.meat_point,
                            extra_caramelized_onion: modal.extra_caramelized_onion,
                            extra_hamburger: modal.extra_hamburger
                          },
                          editRascunhoIndex
                        )
                      }
                    >
                      Adicionar ao pedido
                    </button>
                  </>
                ) : (
                  <div className="space-y-2">
                    {MEAT_POINTS.map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        className="btn btn-primary w-full"
                        onClick={() => addToDraft({ ...modal, meat_point: pt }, editRascunhoIndex)}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {modal.step === 'caipirinha' && (
              <>
                <p className="mb-2 text-sm text-slate-500">Base</p>
                <div className="mb-4 flex gap-2">
                  {CAIPIRINHA_BASES.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={`btn flex-1 ${modal.caipirinha_base === b ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setModal({ ...modal, caipirinha_base: b })}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                <p className="mb-2 text-sm text-slate-500">Picolé?</p>
                <div className="flex gap-2">
                  <button type="button" className={`btn flex-1 ${modal.caipirinha_picole ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModal({ ...modal, caipirinha_picole: true })}>Com picolé</button>
                  <button type="button" className={`btn flex-1 ${!modal.caipirinha_picole ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModal({ ...modal, caipirinha_picole: false })}>Sem picolé</button>
                </div>
                <button type="button" className="btn btn-success mt-4 w-full" onClick={() => addToDraft(modal, editRascunhoIndex)}>Adicionar ao pedido</button>
              </>
            )}

            {modal.step === 'dose' && (
              <>
                <p className="mb-3 text-sm text-slate-500">Acompanhamento</p>
                <div className="space-y-2">
                  {DOSE_ACCOMPANIMENTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className="btn btn-secondary w-full"
                      onClick={() => addToDraft({ ...modal, dose_accompaniment: a }, editRascunhoIndex)}
                    >
                      {a}
                    </button>
                  ))}
                  <button type="button" className="btn btn-secondary w-full" onClick={() => addToDraft(modal, editRascunhoIndex)}>Nenhum</button>
                </div>
              </>
            )}

            {modal.step === 'confirm' && (
              <button type="button" className="btn btn-success w-full" onClick={() => addToDraft(modal, editRascunhoIndex)}>Adicionar ao pedido</button>
            )}

            <button type="button" className="mt-4 w-full rounded-lg py-2 text-slate-600 hover:bg-slate-100" onClick={() => setModal(null)}>Fechar</button>
          </div>
        </div>
      )}

      {editPedidoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-bold text-slate-800">Alterar item</h3>
            <label className="block text-sm font-medium text-slate-700 mb-1">Quantidade</label>
            <input
              type="number"
              min="1"
              value={editPedidoModal.quantity}
              onChange={(e) => setEditPedidoModal((prev) => ({ ...prev, quantity: e.target.value }))}
              className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
            />
            <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
            <textarea
              rows={3}
              value={editPedidoModal.observations}
              onChange={(e) => setEditPedidoModal((prev) => ({ ...prev, observations: e.target.value }))}
              placeholder="Ex.: sabor da caipirinha promo, sem gelo, etc."
              className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditPedidoModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary flex-1" onClick={handleSaveEditPedido}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 space-y-2 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.08)] backdrop-blur-sm">
        {errorMessage && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
            {errorMessage}
          </div>
        )}
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50/80 to-white px-4 py-2.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-slate-700">
              <span className="text-amber-600">{totalItens}</span> itens na comanda
            </span>
            {rascunho.length > 0 && (
              <button
                type="button"
                disabled={enviandoRascunho}
                className="rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-60"
                onClick={footerRascunhoAction}
              >
                {enviandoRascunho ? 'Enviando…' : view === 'revisao' ? `Enviar pedido (${rascunho.length})` : `Revisar e enviar (${rascunho.length})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
