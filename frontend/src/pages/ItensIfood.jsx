import { useCallback, useEffect, useMemo, useState } from 'react'
import { getIfoodMapa, getIfoodItensPdv, salvarIfoodMapa } from '../api'

const ROTULO_SETOR = { grill: 'Churrasqueira', kitchen: 'Cozinha', bar: 'Bar' }

function ChipSetor({ setor }) {
  const texto = ROTULO_SETOR[setor] || 'Sem fila de produção'
  const cor = setor ? 'border-emerald-500/50 text-emerald-400' : 'border-[var(--line)] text-[var(--muted)]'
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${cor}`}>{texto}</span>
}

/** Lista de itens do PDV agrupada por categoria, para o seletor do de-para. */
function SeletorItem({ itens, valor, onChange, disabled }) {
  const grupos = useMemo(() => {
    const m = new Map()
    for (const i of itens) {
      if (!m.has(i.category_name)) m.set(i.category_name, [])
      m.get(i.category_name).push(i)
    }
    return [...m.entries()]
  }, [itens])
  return (
    <select
      className="w-full min-w-[220px] rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
      value={valor ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value) || null)}
    >
      <option value="">Escolha o item do PDV…</option>
      {grupos.map(([cat, lista]) => (
        <optgroup key={cat} label={cat}>
          {lista.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function Linha({ linha, itens, salvando, onSalvar }) {
  const [escolhido, setEscolhido] = useState(linha.auto_created ? null : linha.item_id)
  const mudou = escolhido != null && escolhido !== linha.item_id
  const setorEscolhido = itens.find((i) => i.id === escolhido)?.setor
  return (
    <li className="grid items-center gap-3 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto]">
      <div className="min-w-0">
        <div className="truncate font-semibold text-[var(--ink)]">{linha.external_name || linha.external_key}</div>
        <div className="mt-1 text-xs text-[var(--muted)]">
          {linha.auto_created ? (
            <>Entrando como <b>{linha.item_name}</b> (Cozinha) até ser ligado</>
          ) : (
            <>Ligado a <b className="text-[var(--ink)]">{linha.item_name}</b> · <ChipSetor setor={linha.setor} /></>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SeletorItem itens={itens} valor={escolhido} onChange={setEscolhido} disabled={salvando} />
        {escolhido != null && mudou && <ChipSetor setor={setorEscolhido} />}
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!mudou || salvando}
        onClick={() => onSalvar({ external_key: linha.external_key, item_id: escolhido })}
      >
        {salvando ? 'Salvando…' : linha.auto_created ? 'Ligar' : 'Trocar'}
      </button>
    </li>
  )
}

export default function ItensIfood() {
  const [mapa, setMapa] = useState([])
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [salvandoKey, setSalvandoKey] = useState('')
  const [busca, setBusca] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novoItem, setNovoItem] = useState(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [m, i] = await Promise.all([getIfoodMapa(), getIfoodItensPdv()])
      setMapa(m)
      setItens(i)
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar os itens do iFood.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const salvar = async (payload, rotulo) => {
    setErro('')
    setAviso('')
    setSalvandoKey(payload.external_key || payload.external_name)
    try {
      await salvarIfoodMapa(payload)
      setAviso(`${rotulo} ligado. Os próximos pedidos já entram no setor certo.`)
      await carregar()
      return true
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.')
      return false
    } finally {
      setSalvandoKey('')
    }
  }

  const filtrar = (l) => !busca.trim() || String(l.external_name || l.external_key).toLowerCase().includes(busca.trim().toLowerCase())
  const pendentes = mapa.filter((l) => l.auto_created && filtrar(l))
  const ligados = mapa.filter((l) => !l.auto_created && filtrar(l))
  const totalPendentes = mapa.filter((l) => l.auto_created).length

  if (carregando) return <div className="p-4 text-[var(--muted)]">Carregando…</div>

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-[var(--ink)]">Itens do iFood</h1>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Liga cada item do catálogo do iFood a um item do PDV. É isso que decide em qual tela o pedido aparece (Churrasqueira, Cozinha ou Bar) e que entra na contagem de produção.
      </p>

      {erro && <p className="mb-3 rounded-lg bg-[#3a1d1d] px-3 py-2 text-sm text-[#f08a8a]">{erro}</p>}
      {aviso && <p className="mb-3 rounded-lg bg-[#123324] px-3 py-2 text-sm text-[#35d67c]">{aviso}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${totalPendentes ? 'border-red-500/60 text-red-400' : 'border-emerald-500/50 text-emerald-400'}`}
        >
          {totalPendentes ? `${totalPendentes} item(ns) sem ligação` : 'Todos os itens estão ligados'}
        </span>
        <input
          type="search"
          className="min-w-[220px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
          placeholder="Buscar item do iFood…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {pendentes.length > 0 && (
        <section className="mb-5 rounded-xl border border-red-500/40 bg-[var(--surface)] shadow-sm">
          <h2 className="border-b border-[var(--line)] p-3 font-semibold text-[var(--ink)]">
            Precisam de ligação ({pendentes.length})
          </h2>
          <ul className="divide-y divide-[var(--line)]">
            {pendentes.map((l) => (
              <Linha
                key={l.external_key}
                linha={l}
                itens={itens}
                salvando={salvandoKey === l.external_key}
                onSalvar={(p) => salvar(p, l.external_name || 'Item')}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mb-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">
        <h2 className="border-b border-[var(--line)] p-3 font-semibold text-[var(--ink)]">Já ligados ({ligados.length})</h2>
        {ligados.length === 0 ? (
          <p className="p-3 text-sm text-[var(--muted)]">Nenhum item ligado ainda.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {ligados.map((l) => (
              <Linha
                key={l.external_key}
                linha={l}
                itens={itens}
                salvando={salvandoKey === l.external_key}
                onSalvar={(p) => salvar(p, l.external_name || 'Item')}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm">
        <h2 className="mb-1 font-semibold text-[var(--ink)]">Adicionar item do iFood</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Cadastrou um item novo no iFood? Ligue antes do primeiro pedido: digite o nome exatamente como aparece lá.
        </p>
        <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto]">
          <input
            type="text"
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            placeholder="Nome no iFood (ex.: Alcatra na Pedra)"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
          />
          <SeletorItem itens={itens} valor={novoItem} onChange={setNovoItem} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!novoNome.trim() || !novoItem || Boolean(salvandoKey)}
            onClick={async () => {
              const ok = await salvar({ external_name: novoNome.trim(), item_id: novoItem }, novoNome.trim())
              if (ok) {
                setNovoNome('')
                setNovoItem(null)
              }
            }}
          >
            Ligar
          </button>
        </div>
      </section>
    </div>
  )
}
