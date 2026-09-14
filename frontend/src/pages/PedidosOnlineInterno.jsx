import { useState, useEffect, useRef } from "react";
import { getOrders, updateOrderStatus, getPrintOrder } from "../api";
import { useSocket } from "../socket";
import {
  buildPedidoOnlinePrintHtml,
  formatFormaPagamentoLabel,
  openComandaPrintWindow,
} from "../utils/comandaImpressao";
import Icon from "../components/Icon";
import PedidoElapsed from "../components/PedidoElapsed";
const labels = {
  aguardando_pagamento: "Aguardando PIX",
  recebido: "Recebido",
  em_producao: "Em preparo",
  pronto: "Pronto",
  saiu_entrega: "Em entrega",
  entregue: "Concluído",
  cancelado: "Cancelado",
};
const cash = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const finished = (o) => ["entregue", "cancelado"].includes(o.status);
const columns = [
  {
    name: "Novos pedidos",
    hint: "Aguardando confirmação",
    states: ["aguardando_pagamento", "recebido"],
    tone: "blue",
  },
  {
    name: "Em preparo",
    hint: "Na cozinha e produção",
    states: ["em_producao"],
    tone: "amber",
  },
  {
    name: "Prontos",
    hint: "Aguardando saída ou retirada",
    states: ["pronto"],
    tone: "green",
  },
  { name: "Em entrega", hint: "A caminho do cliente", states: ["saiu_entrega"], tone: "amber" },
];
function sound() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)(),
      o = c.createOscillator(),
      g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    o.frequency.value = 800;
    g.gain.setValueAtTime(0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
    o.start();
    o.stop(c.currentTime + 0.3);
    o.onended = () => c.close();
  } catch {
    /* Áudio depende de interação do operador. */
  }
}
export default function PedidosOnlineInterno() {
  const [orders, setOrders] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [type, setType] = useState(""),
    [view, setView] = useState("active"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [cancel, setCancel] = useState(false),
    [reason, setReason] = useState(""),
    [notice, setNotice] = useState(null),
    [feedback, setFeedback] = useState("");
  const timer = useRef(null);
  const load = async () => {
    try {
      setOrders(await getOrders());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => clearTimeout(timer.current);
  }, []);
  useSocket((payload, event) => {
    void load();
    if (event === "novo-pedido-online") {
      sound();
      setNotice(payload);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setNotice(null), 8000);
    }
  });
  const list = orders.filter(
      (o) =>
        (!type || o.tipo === type) &&
        (!search ||
          `${o.id} ${o.cliente_nome} ${o.cliente_telefone}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    ),
    active = list.filter((o) => !finished(o)),
    history = list.filter(finished),
    detail = orders.find((o) => o.id === selected);
  const update = async (status) => {
    if (!detail || busy) return;
    setBusy(true);
    try {
      await updateOrderStatus(
        detail.id,
        status,
        status === "cancelado" ? reason : undefined,
      );
      setCancel(false);
      setReason("");
      setFeedback(`Pedido #${detail.id}: ${labels[status]}.`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const print = async (o) => {
    try {
      const d = await getPrintOrder(o.id);
      openComandaPrintWindow(
        buildPedidoOnlinePrintHtml(d),
        `Pedido #${d.numero}`,
      );
    } catch (e) {
      setError(e.message);
    }
  };
  const next = (o) =>
    o.status === "recebido"
      ? ["em_producao", "Confirmar pedido"]
      : o.status === "em_producao"
        ? ["pronto", "Marcar como pronto"]
        : o.status === "pronto"
          ? o.tipo === "delivery"
            ? ["saiu_entrega", "Saiu para entrega"]
            : ["entregue", "Confirmar retirada"]
          : o.status === "saiu_entrega"
            ? ["entregue", "Confirmar entrega"]
            : null;
  const Card = ({ o }) => (
    <button
      className="order-ticket"
      onClick={() => {
        setSelected(o.id);
        setCancel(false);
      }}
    >
      <div className="ticket-heading">
        <strong>#{String(o.id).padStart(3, "0")}</strong>
        <span>
          <Icon name={o.tipo === "delivery" ? "truck" : "orders"} size={14} />
          {o.tipo === "delivery" ? "Delivery" : "Retirada"}
        </span>
      </div>
      <h3>{o.cliente_nome}</h3>
      <p className="ticket-items">
        {o.items?.reduce((n, i) => n + i.quantity, 0) || 0} itens ·{" "}
        {o.items
          ?.slice(0, 2)
          .map((i) => i.item_name)
          .join(", ")}
      </p>
      <div className="ticket-foot">
        <span>
          <Icon name="clock" size={13} />
          <PedidoElapsed createdAt={o.created_at} />
        </span>
        <strong>{cash(o.valor_total)}</strong>
      </div>
      {o.status === "aguardando_pagamento" && (
        <span className="ticket-payment">Aguardando pagamento PIX</span>
      )}
    </button>
  );
  return (
    <div className="online-workspace">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CENTRAL DE PEDIDOS</span>
          <h1>Pedidos online</h1>
          <p>Do recebimento à entrega, cada pedido no seu lugar.</p>
        </div>
        <button className="btn btn-secondary" onClick={load}>
          <Icon name="refresh" size={17} />
          Atualizar
        </button>
      </header>
      {notice && (
        <div className="notice-banner" role="status">
          <Icon name="bell" />
          <strong>Novo pedido #{notice.orderId}</strong>
          <span>{notice.cliente_nome}</span>
          <button
            onClick={() => {
              setSelected(notice.orderId);
              setNotice(null);
            }}
          >
            Ver pedido →
          </button>
        </div>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {feedback && <p className="operation-feedback" role="status">{feedback}</p>}
      <div className="work-toolbar">
        <div className="segmented">
          <button
            className={view === "active" ? "selected" : ""}
            onClick={() => setView("active")}
          >
            Em andamento<span className="count">{active.length}</span>
          </button>
          <button
            className={view === "history" ? "selected" : ""}
            onClick={() => setView("history")}
          >
            Histórico<span className="count">{history.length}</span>
          </button>
        </div>
        <label className="search-field">
          <Icon name="search" size={18} />
          <input
            placeholder="Buscar pedido ou cliente"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Tipo do pedido"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Todos os canais</option>
          <option value="delivery">Delivery</option>
          <option value="retirada">Retirada</option>
        </select>
      </div>
      {loading ? (
        <div className="empty-panel">Carregando pedidos…</div>
      ) : view === "active" ? (
        <div className="order-board">
          {columns.map((col) => {
            const rows = active.filter((o) => col.states.includes(o.status)).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
            return (
              <section className={`order-lane ${col.tone}`} key={col.name}>
                <header>
                  <div>
                    <h2>
                      <i className={`status-dot ${col.tone}`} />
                      {col.name}
                      <span>{rows.length}</span>
                    </h2>
                    <p>{col.hint}</p>
                  </div>
                </header>
                <div className="lane-cards">
                  {rows.map((o) => (
                    <Card key={o.id} o={o} />
                  ))}
                  {!rows.length && (
                    <div className="lane-empty">
                      <Icon name="orders" size={26} />
                      <span>Nenhum pedido nesta etapa</span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="data-panel">
          <div className="section-heading">
            <h2>Histórico de pedidos</h2>
            <span>{history.length} registros</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Canal</th>
                  <th>Status</th>
                  <th className="numeric">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <button
                        className="text-action"
                        onClick={() => setSelected(o.id)}
                      >
                        #{o.id}
                      </button>
                    </td>
                    <td>{o.cliente_nome}</td>
                    <td>
                      {o.created_at
                        ?.slice(0, 10)
                        .split("-")
                        .reverse()
                        .join("/")}{" "}
                      {o.created_at?.slice(11, 16)}
                    </td>
                    <td>{o.tipo === "delivery" ? "Delivery" : "Retirada"}</td>
                    <td>
                      <span
                        className={`state-badge ${o.status === "cancelado" ? "red" : "green"}`}
                      >
                        {labels[o.status]}
                      </span>
                    </td>
                    <td className="numeric">{cash(o.valor_total)}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Imprimir pedido ${o.id}`}
                        onClick={() => print(o)}
                      >
                        <Icon name="print" size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!history.length && (
            <div className="empty-panel">
              Nenhum pedido concluído ou cancelado.
            </div>
          )}
        </div>
      )}
      {detail && (
        <div
          className="drawer-backdrop"
          onClick={() => {
            setSelected(null);
            setCancel(false);
          }}
        >
          <aside
            className="order-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Pedido ${detail.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="drawer-header">
              <div>
                <span className="eyebrow">
                  {detail.tipo === "delivery" ? "DELIVERY" : "RETIRADA"}
                </span>
                <h2>Pedido #{detail.id}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar detalhes"
                onClick={() => setSelected(null)}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="drawer-content">
              <div className="detail-status">
                <span
                  className={`state-badge ${detail.status === "cancelado" ? "red" : ["pronto","entregue"].includes(detail.status) ? "green" : "amber"}`}
                >
                  {labels[detail.status]}
                </span>
                <span>{detail.created_at?.slice(11, 16)}</span>
              </div>
              <section className="detail-section">
                <h3>
                  <Icon name="user" size={17} />
                  Cliente
                </h3>
                <strong>{detail.cliente_nome}</strong>
                <p>{detail.cliente_telefone}</p>
                {detail.cliente_email && <p>{detail.cliente_email}</p>}
              </section>
              {detail.tipo === "delivery" && (
                <section className="detail-section">
                  <h3>
                    <Icon name="pin" size={17} />
                    Endereço de entrega
                  </h3>
                  <p>
                    {detail.endereco_rua}, {detail.endereco_numero}
                  </p>
                  <p>
                    {detail.endereco_bairro}
                    {detail.endereco_complemento
                      ? ` · ${detail.endereco_complemento}`
                      : ""}
                  </p>
                  {detail.endereco_referencia && (
                    <p>Referência: {detail.endereco_referencia}</p>
                  )}
                </section>
              )}
              <section className="detail-section">
                <h3>
                  <Icon name="receipt" size={17} />
                  Itens do pedido
                </h3>
                {detail.items?.map((i) => (
                  <div className="detail-item" key={i.id}>
                    <span className="quantity-badge">{i.quantity}×</span>
                    <div>
                      <strong>{i.item_name}</strong>
                      {i.observations && <small>{i.observations}</small>}
                    </div>
                    <span>{cash(i.quantity * i.unit_price)}</span>
                  </div>
                ))}
              </section>
              {detail.observacoes && (
                <div className="detail-observation">
                  <strong>Observações</strong>
                  <p>{detail.observacoes}</p>
                </div>
              )}
              <section className="detail-section">
                <h3>Pagamento</h3>
                <p>
                  {formatFormaPagamentoLabel(detail.forma_pagamento)}
                  {detail.payment_status === "aprovado" ? " · Pago" : ""}
                </p>
                <div className="detail-total">
                  <span>Total do pedido</span>
                  <strong>{cash(detail.valor_total)}</strong>
                </div>
              </section>
              {detail.motivo_cancelamento && (
                <p className="error-banner">
                  Motivo: {detail.motivo_cancelamento}
                </p>
              )}
              {error && <p className="error-banner">{error}</p>}
              {cancel && (
                <div className="cancel-box">
                  <label className="field-label">
                    Motivo do cancelamento
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="O cliente verá esta informação"
                      rows={3}
                    />
                  </label>
                  <div className="dialog-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={() => setCancel(false)}
                    >
                      Voltar
                    </button>
                    <button
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => update("cancelado")}
                    >
                      Confirmar cancelamento
                    </button>
                  </div>
                </div>
              )}
            </div>
            <footer className="drawer-actions">
              {next(detail) && (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => update(next(detail)[0])}
                >
                  <Icon name="check" size={18} />
                  {busy ? "Salvando…" : next(detail)[1]}
                </button>
              )}
              <div>
                <button
                  className="btn btn-secondary"
                  onClick={() => print(detail)}
                >
                  <Icon name="print" size={16} />
                  Imprimir comanda
                </button>
                {!finished(detail) && (
                  <button
                    className="text-danger"
                    onClick={() => setCancel(true)}
                  >
                    Cancelar / recusar
                  </button>
                )}
              </div>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
