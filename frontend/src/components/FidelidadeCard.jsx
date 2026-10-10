import './FidelidadeCard.css'
import Icon from './Icon'
import { mensagemFidelidade, primeiroNome } from '../utils/fidelidade'

/**
 * Cartão fidelidade do delivery: 10 carimbos. Os concluídos ficam cheios; os pedidos já feitos e ainda
 * não entregues aparecem "contando" (pulsando) e viram carimbo quando o pedido é entregue.
 *
 * @param fidelidade  objeto devolvido por GET /api/public/cliente
 * @param nome        nome do cliente (cumprimento opcional)
 * @param compact     versão compacta, para o topo do cardápio
 */
export default function FidelidadeCard({ fidelidade, nome = '', compact = false, saudacao = false }) {
  const f = fidelidade || {}
  const meta = f.meta || 10
  const msg = mensagemFidelidade(f)
  const recompensa = msg.tipo === 'recompensa'
  const concluidos = recompensa ? meta : Math.min(meta, f.no_ciclo || 0)
  const andamento = recompensa ? 0 : Math.min(meta - concluidos, f.em_andamento || 0)

  return (
    <section className={`fidelidade-card is-${msg.tipo} ${compact ? 'is-compact' : ''}`} aria-live="polite">
      <header>
        <span className="fidelidade-card-icon" aria-hidden="true"><Icon name="gift" size={compact ? 18 : 20} /></span>
        <div>
          <small>Cartão fidelidade</small>
          <strong>{saudacao && nome ? `${primeiroNome(nome)}, ` : ''}{msg.titulo}</strong>
        </div>
        <b className="fidelidade-card-count" aria-label={`${concluidos} de ${meta} pedidos`}>
          {concluidos}<span>/{meta}</span>
        </b>
      </header>
      <ol className="fidelidade-card-stamps" aria-hidden="true">
        {Array.from({ length: meta }, (_, i) => {
          const estado = i < concluidos ? 'on' : i < concluidos + andamento ? 'pending' : 'off'
          const premio = i === meta - 1
          return (
            <li key={i} className={`is-${estado} ${premio ? 'is-prize' : ''}`}>
              {estado === 'on' ? <Icon name="check" size={13} /> : premio ? `${f.percentual || 20}%` : i + 1}
            </li>
          )
        })}
      </ol>
      <p>{msg.detalhe}</p>
    </section>
  )
}
