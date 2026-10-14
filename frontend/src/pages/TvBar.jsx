import { useState, useEffect, useRef } from 'react'
import { getPedidosBar } from '../api'
import { useSocket } from '../socket'
import { comandaOnlineLabel, comandaOrigemLabel, isTipoPedidoOnline, pedidoOnlineTvBannerModel, tvPedidoCardClass } from '../utils/comandaOnlineVisual'

export default function TvBar() {
  const [list, setList] = useState([])

  const load = async () => {
    const data = await getPedidosBar()
    setList(data)
  }

  useEffect(() => { const initial=setTimeout(()=>void load(),0); return()=>clearTimeout(initial) }, [])
  const recargaRef = useRef(null)
  useEffect(() => () => { if (recargaRef.current) clearTimeout(recargaRef.current) }, [])
  // Cada pedido lancado no restaurante dispara este evento: junta varios em uma unica recarga
  useSocket(() => {
    if (recargaRef.current) clearTimeout(recargaRef.current)
    recargaRef.current = setTimeout(() => { void load(); recargaRef.current = null }, 350)
  })

  return (
    <div className="min-h-screen bg-[#242a30] p-6">
      <h1 className="mb-2 text-center text-3xl font-bold text-[#e37a01] md:text-4xl">TV BAR — BOSQUE DA CARNE</h1>
      <p className="mb-6 text-center text-lg text-[#b5bfcf]">Caipirinhas, doses e drinks</p>
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
            <div className="mb-2 flex flex-wrap items-center gap-2 font-bold text-2xl text-[#e37a01]">
              <span>Comanda {p.comanda_id} — Mesa {p.mesa}</span>
              {isTipoPedidoOnline(p.comanda_tipo_online) && (
                <span className="rounded-full bg-[#2b2839] px-3 py-1 text-base font-black uppercase text-[#5b1fb7]">Pedir online</span>
              )}
              {comandaOrigemLabel(p) && (
                <span className="rounded-full bg-[#ea1d2c] px-3 py-1 text-lg font-black text-white">{comandaOrigemLabel(p)}</span>
              )}
              {comandaOnlineLabel(p.comanda_tipo_online) && (
                <span className="rounded-full bg-black/10 px-3 py-1 text-lg text-[#c5cedc]">{comandaOnlineLabel(p.comanda_tipo_online)}</span>
              )}
            </div>
            <p className="text-[#bbc6d6]">{p.quantity}x {p.item_name}</p>
          </div>
          );
        })}
      </div>
      {list.length === 0 && <p className="text-center text-2xl text-[#8f9db2]">Nenhum pedido no momento</p>}
    </div>
  )
}
