import { useState, useEffect } from 'react'
import { getPedidosBar } from '../api'
import { useSocket } from '../socket'
import { comandaOnlineLabel, isTipoPedidoOnline, pedidoOnlineTvBannerModel, tvPedidoCardClass } from '../utils/comandaOnlineVisual'

export default function TvBar() {
  const [list, setList] = useState([])

  const load = async () => {
    const data = await getPedidosBar()
    setList(data)
  }

  useEffect(() => { const initial=setTimeout(()=>void load(),0); return()=>clearTimeout(initial) }, [])
  useSocket(() => load())

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <h1 className="mb-2 text-center text-3xl font-bold text-amber-600 md:text-4xl">TV BAR — BOSQUE DA CARNE</h1>
      <p className="mb-6 text-center text-lg text-slate-600">Caipirinhas, doses e drinks</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => {
          const tvB = pedidoOnlineTvBannerModel(p.comanda_tipo_online)
          return (
          <div key={p.id} className={tvPedidoCardClass(p)}>
            {tvB && (
              <div className={tvB.wrap}>
                <p className={tvB.titleClass}>{tvB.title}</p>
                <p className={tvB.subtitleClass}>{tvB.subtitle}</p>
              </div>
            )}
            <div className="mb-2 flex flex-wrap items-center gap-2 font-bold text-2xl text-amber-600">
              <span>Comanda {p.comanda_id} — Mesa {p.mesa}</span>
              {isTipoPedidoOnline(p.comanda_tipo_online) && (
                <span className="rounded-full bg-violet-200 px-3 py-1 text-base font-black uppercase text-violet-900">Pedir online</span>
              )}
              {comandaOnlineLabel(p.comanda_tipo_online) && (
                <span className="rounded-full bg-black/10 px-3 py-1 text-lg text-slate-800">{comandaOnlineLabel(p.comanda_tipo_online)}</span>
              )}
            </div>
            <p className="text-slate-700">{p.quantity}x {p.item_name}</p>
          </div>
          );
        })}
      </div>
      {list.length === 0 && <p className="text-center text-2xl text-slate-500">Nenhum pedido no momento</p>}
    </div>
  )
}
