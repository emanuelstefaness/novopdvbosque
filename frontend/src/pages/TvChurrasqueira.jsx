import { useState, useEffect } from 'react'
import { getPedidosGrill } from '../api'
import { useSocket } from '../socket'
import { comandaOnlineLabel, isTipoPedidoOnline, pedidoOnlineTvBannerModel, tvPedidoCardClass } from '../utils/comandaOnlineVisual'
import { observacaoParaProducao } from '../utils/productionObservations'

export default function TvChurrasqueira() {
  const [list, setList] = useState([])

  const load = async () => {
    const data = await getPedidosGrill()
    setList(data)
  }

  useEffect(() => { const initial=setTimeout(()=>void load(),0); return()=>clearTimeout(initial) }, [])
  useSocket(() => load())

  return (
    <div className="min-h-screen bg-[#242a30] p-6">
      <h1 className="mb-6 text-center text-3xl font-bold text-[#e37a01] md:text-4xl">TV CHURRASQUEIRA — BOSQUE DA CARNE</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => {
          const tvB = pedidoOnlineTvBannerModel(p.comanda_tipo_online)
          const obsTv = observacaoParaProducao(p.observations)
          return (
          <div key={p.id} className={tvPedidoCardClass(p)}>
            {tvB && (
              <div className={tvB.wrap}>
                <p className={tvB.titleClass}>{tvB.title}</p>
                <p className={tvB.subtitleClass}>{tvB.subtitle}</p>
              </div>
            )}
            <div className="mb-2 flex flex-wrap items-center gap-2 font-bold text-2xl text-[#e37a01]">
              <span>Comanda {p.comanda_id} — Mesa {p.mesa}</span>
              {isTipoPedidoOnline(p.comanda_tipo_online) && (
                <span className="rounded-full bg-[#2b2839] px-3 py-1 text-base font-black uppercase text-[#5b1fb7]">Pedir online</span>
              )}
              {comandaOnlineLabel(p.comanda_tipo_online) && (
                <span className="rounded-full bg-black/10 px-3 py-1 text-lg text-[#c5cedc]">{comandaOnlineLabel(p.comanda_tipo_online)}</span>
              )}
            </div>
            <p className="text-[#bbc6d6]">{p.quantity}x {p.item_name}</p>
            {obsTv && (
              <p className="mt-2 rounded-lg border border-[#2b2839] bg-[#23202e] px-3 py-2 text-lg font-semibold text-[#5e1fc2]">
                {obsTv}
              </p>
            )}
            {p.meat_point && <p className="mt-2 text-lg font-semibold text-[#16c355]">Ponto: {p.meat_point}</p>}
          </div>
          );
        })}
      </div>
      {list.length === 0 && <p className="text-center text-2xl text-[#8f9db2]">Nenhum pedido no momento</p>}
    </div>
  )
}
