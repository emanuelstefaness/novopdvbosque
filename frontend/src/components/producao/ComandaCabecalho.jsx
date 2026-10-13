import { earliestCreatedAt } from '../../utils/pedidoTime'
import { comandaOnlineLabel, comandaOrigemLabel, isTipoPedidoOnline } from '../../utils/comandaOnlineVisual'
import {
  autoriaDaComanda,
  formatarDecorrido,
  prioridadeDaComanda,
  ROTULO_PRIORIDADE,
  rotuloDaMesa,
} from '../../utils/producao'

function IconeRelogio() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.6V8l2.3 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconeUsuario() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="8" cy="5.4" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.8 13.4c.5-2.5 2.6-3.9 5.2-3.9s4.7 1.4 5.2 3.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Cabeçalho padrão da comanda nas telas de produção: número, mesa/origem, garçom, tempo, status e ação coletiva.
 * `itens` são os pedidos (linhas da fila) da comanda.
 */
export default function ComandaCabecalho({ itens, agora, onTudoPronto, ocupado = false, rotuloBotao = 'Tudo pronto' }) {
  const primeiro = itens[0] || {}
  const numero = primeiro.production_number || primeiro.comanda_id
  const tipoOnline = primeiro.comanda_tipo_online
  const online = isTipoPedidoOnline(tipoOnline)
  const origemIfood = comandaOrigemLabel(primeiro)
  const mesa = rotuloDaMesa(primeiro)
  const { nomes, semGarcom } = autoriaDaComanda(itens)
  const { nivel } = prioridadeDaComanda(itens, agora)
  const decorrido = formatarDecorrido(earliestCreatedAt(itens), agora)
  const garcom = nomes.join(', ')

  return (
    <header className="kds-head">
      <div className="kds-head-top">
        <h2 className="kds-numero" aria-label={`Comanda ${numero}`}>
          <span className="kds-numero-rotulo">Comanda</span> #{numero}
        </h2>
        <span className={`kds-tempo is-${nivel}`} title="Tempo desde o pedido mais antigo desta comanda na fila">
          <IconeRelogio /> {decorrido}
        </span>
      </div>
      <div className="kds-head-linha">
        {mesa && <span className="kds-mesa">{mesa}</span>}
        {primeiro.production_number ? <span className="kds-chip">Paga</span> : null}
      </div>
      <div className="kds-head-linha kds-head-autoria">
        {garcom ? (
          <span className="kds-garcom" title={`Lançado por ${garcom}`}>
            <IconeUsuario />
            <span className="kds-garcom-nome">{garcom}</span>
          </span>
        ) : semGarcom ? (
          <span className="kds-garcom is-vazio"><IconeUsuario /> Sem garçom atribuído</span>
        ) : null}
      </div>
      <div className="kds-head-rodape">
        <div className="kds-badges">
          {origemIfood && <span className="kds-chip is-ifood">{origemIfood}</span>}
          {online && <span className={`kds-chip is-${tipoOnline}`}>{comandaOnlineLabel(tipoOnline).replace(/^\S+\s/, '')}</span>}
          <span className={`kds-chip is-status-${nivel}`}>{ROTULO_PRIORIDADE[nivel]}</span>
        </div>
        {onTudoPronto && (
          <button type="button" className="kds-btn is-principal" disabled={ocupado} onClick={onTudoPronto}>
            {rotuloBotao}
          </button>
        )}
      </div>
    </header>
  )
}
