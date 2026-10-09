import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import {useWaiter} from "../context/useWaiter";
import { getComandas, getOrders, loginOperator, getOnlineStatus, setOnlineMode } from "../api";
import { useSocket } from "../socket";
import Icon from "../components/Icon";
const modules = [
  ["/garcons", "Mesas e comandas", "Abra uma mesa e lance pedidos.", "receipt"],
  [
    "/caixa",
    "Frente de caixa",
    "Confira contas e registre pagamentos.",
    "wallet",
  ],
  [
    "/pedidos-online",
    "Pedidos online",
    "Acompanhe delivery e retirada.",
    "orders",
  ],
  ["/cozinha", "Cozinha", "Organize os pedidos em preparo.", "chef"],
  ["/churrasqueira", "Churrasqueira", "Carnes, espetinhos e pontos.", "flame"],
  ["/bar", "Bar", "Bebidas e drinks da operação.", "cup"],
  ["/cardapio", "Cardápio", "Produtos, categorias e preços.", "book"],
  ["/admin", "Relatórios", "Vendas e resultados do período.", "chart"],
  ["/financeiro", "Financeiro", "Recebimentos e despesas.", "wallet"],
];
const cash = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabel = (st) => {
  const s = String(st || "").toLowerCase();
  if (s === "paying") return "Pagamento";
  if (s === "ordering") return "Pedindo";
  if (s === "open") return "Aberta";
  return s;
};
const FREE_PREVIEW_LIMIT = 12;
export default function Home() {
  const { waiter, setWaiter } = useWaiter();
  const [mode, setMode] = useState("caixa"),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const [comandas, setComandas] = useState({}),
    [orders, setOrders] = useState([]),
    [online, setOnline] = useState(null),
    [onlineBusy, setOnlineBusy] = useState(false);
  const load = async () => {
    if (!waiter) return;
    try {
      const [c, o, on] = await Promise.all([
        getComandas(),
        waiter.isCaixa ? getOrders() : Promise.resolve([]),
        waiter.isCaixa ? getOnlineStatus() : Promise.resolve(null),
      ]);
      setComandas(c);
      setOrders(o);
      setOnline(on);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    const initial=setTimeout(()=>void load(),0);
    return()=>clearTimeout(initial);
  }, [waiter]);
  useSocket(() => void load());
  const changeOnline = async (modo) => {
    if (onlineBusy) return;
    if (
      modo === "fechado" &&
      !window.confirm("Fechar os pedidos online agora? Os clientes não poderão fazer novos pedidos.")
    )
      return;
    setOnlineBusy(true);
    try {
      setOnline(await setOnlineMode(modo));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setOnlineBusy(false);
    }
  };
  const login = async (e) => {
    e.preventDefault();
    try {
      if (mode === "garcom" && name.trim().length < 2) {
        setError("Informe seu nome para entrar.");
        return;
      }
      const user = await loginOperator(mode, password, name.trim());
      setWaiter(user);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  if (!waiter)
    return (
      <div className="login-page">
        <div className="login-brand">
          <img className="establishment-logo login-logo" src="/logo-bosque-transparente-256.png" alt="Bosque da Carne" />
        </div>
        <main className="login-card">
          <span className="eyebrow">ACESSO À OPERAÇÃO</span>
          <h1>Entrar no sistema</h1>
          <p>Entre para iniciar o atendimento.</p>
          <div className="segmented">
            <button
              className={mode === "caixa" ? "selected" : ""}
              onClick={() => {
                setMode("caixa");
                setError("");
              }}
            >
              <Icon name="wallet" size={17} />
              Caixa e produção
            </button>
            <button
              className={mode === "garcom" ? "selected" : ""}
              onClick={() => {
                setMode("garcom");
                setError("");
              }}
            >
              <Icon name="user" size={17} />
              Garçom
            </button>
          </div>
          <form onSubmit={login}>
            {mode === "caixa" ? (
              <label className="field-label">
                Senha do caixa
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  autoFocus
                />
              </label>
            ) : (
              <label className="field-label">
                Seu nome
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Digite seu nome para entrar"
                  autoComplete="off"
                  maxLength={40}
                  required
                  autoFocus
                />
                <small style={{ color: "var(--muted)", fontSize: 12, fontWeight: 400 }}>
                  Seu nome fica registrado em tudo que você lançar.
                </small>
              </label>
            )}
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary login-submit" type="submit">
              Entrar no sistema
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <Link className="login-public" to="/pedir">
            Quero fazer um pedido <Icon name="arrow" size={16} />
          </Link>
        </main>
        <footer>Bosque da Carne · Sistema de atendimento</footer>
      </div>
    );
  const active = Object.values(comandas).filter(
      (c) => c.id <= 200 && ["open", "ordering", "paying"].includes(c.status),
    ),
    pending = orders.filter(
      (o) => !["entregue", "cancelado"].includes(o.status),
    );
  const openIds = [];
  for (let i = 1; i <= 200; i++) {
    const c = comandas[i];
    if (c?.mesa && ["open", "ordering", "paying"].includes(String(c.status).toLowerCase())) openIds.push(i);
  }
  openIds.sort(
    (a, b) =>
      Number(comandas[b].status === "paying") - Number(comandas[a].status === "paying") ||
      String(comandas[a].created_at).localeCompare(String(comandas[b].created_at)),
  );
  const openSet = new Set(openIds);
  const freeIds = [];
  for (let i = 1; i <= 200 && freeIds.length < FREE_PREVIEW_LIMIT; i++)
    if (!openSet.has(i)) freeIds.push(i);
  return (
    <div className="overview-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">OPERAÇÃO DO RESTAURANTE</span>
          <h1>Visão geral</h1>
          <p>Acompanhe o atendimento e acesse sua área de trabalho.</p>
        </div>
        <Link
          className="btn btn-primary"
          to={waiter.isCaixa ? "/caixa" : "/garcons"}
        >
          <Icon name="plus" size={18} />
          Iniciar atendimento
        </Link>
      </header>
      {error && <p className="error-banner">{error}</p>}
      {waiter.isCaixa && online && (
        <section
          className={"online-switch " + (online.online_ativo ? "is-open" : "is-closed")}
          aria-label="Pedidos online"
        >
          <div className="online-switch-info">
            <span className="online-switch-dot" aria-hidden="true" />
            <div>
              <strong>
                Pedidos online: {online.online_ativo ? "ABERTO" : "FECHADO"}
              </strong>
              <p>
                {online.modo === "forcado_ambiente"
                  ? "Estado forçado pela configuração do servidor (PEDIDOS_ONLINE_ATIVO)."
                  : online.modo.startsWith("manual_")
                    ? `Definido manualmente. Volta ao horário automático às ${new Date(online.manual_ate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
                    : "Seguindo o horário automático (quarta a sábado, 19h às 23h30)."}
              </p>
            </div>
          </div>
          <div className="online-switch-actions">
            {online.online_ativo ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={onlineBusy || online.modo === "forcado_ambiente"}
                onClick={() => changeOnline("fechado")}
              >
                Fechar pedidos online
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={onlineBusy || online.modo === "forcado_ambiente"}
                onClick={() => changeOnline("aberto")}
              >
                Abrir pedidos online
              </button>
            )}
            {online.modo.startsWith("manual_") && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={onlineBusy}
                onClick={() => changeOnline("automatico")}
              >
                Voltar ao horário automático
              </button>
            )}
          </div>
        </section>
      )}
      <div className="overview-metrics">
        <div>
          <span>Comandas em atendimento</span>
          <strong>
            {active.length}
            <small>/ 200</small>
          </strong>
          <p>
            <i className="status-dot green" />
            {200 - active.length} disponíveis
          </p>
        </div>
        <div>
          <span>Aguardando pagamento</span>
          <strong>
            {active
              .filter((c) => c.status === "paying")
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <p>Contas para finalizar no caixa</p>
        </div>
        {waiter.isCaixa && (
          <div>
            <span>Pedidos online ativos</span>
            <strong>{pending.length.toString().padStart(2, "0")}</strong>
            <p>Delivery e retirada</p>
          </div>
        )}
      </div>
      {waiter.isCaixa && (
        <>
          <section className="cash-grid-section" aria-labelledby="dash-open-title">
            <header>
              <h2 id="dash-open-title">
                Pedidos em andamento <span>{openIds.length}</span>
              </h2>
            </header>
            {openIds.length ? (
              <div className="cash-comandas-grid">
                {openIds.map((id) => {
                  const c = comandas[id];
                  return (
                    <Link
                      key={id}
                      to={`/garcons/${id}/pedidos`}
                      className={"cash-comanda occupied " + (c.status === "paying" ? "awaiting" : c.status === "open" ? "just-opened" : "")}
                    >
                      <span className="cash-comanda-status">{statusLabel(c.status)}</span>
                      <strong className="cash-comanda-number">{String(id).padStart(2, "0")}</strong>
                      <span className="cash-comanda-bottom">
                        <span>Mesa {c.mesa}</span>
                        <b>{cash(c.saldo ?? c.total_pedidos)}</b>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="cash-grid-empty">Nenhuma comanda aberta no momento.</p>
            )}
          </section>
          <section className="cash-grid-section cash-free-grid-section" aria-labelledby="dash-free-title">
            <header>
              <h2 id="dash-free-title">
                Mesas livres <span>{200 - openIds.length}</span>
              </h2>
              <Link to="/garcons" className="text-action">
                Ver todas
              </Link>
            </header>
            <div className="cash-comandas-grid free-grid">
              {freeIds.map((id) => (
                <Link key={id} to="/garcons" className="cash-comanda available">
                  <strong className="cash-comanda-number">{String(id).padStart(2, "0")}</strong>
                  <span>
                    Livre <Icon name="plus" size={13} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
      <div className="section-heading">
        <h2>Áreas de trabalho</h2>
        <span>Escolha onde deseja atuar</span>
      </div>
      <div className="module-grid">
        {modules
          .filter(([path]) => waiter.isCaixa || path === "/garcons")
          .map(([path, title, desc, icon]) => (
            <Link to={path} className="module-card" key={path}>
              <span className="module-icon">
                <Icon name={icon} size={24} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{desc}</p>
              </div>
              <Icon name="arrow" size={18} />
            </Link>
          ))}
      </div>
      <div className="overview-bottom">
        <Icon name="monitor" size={22} />
        <div>
          <strong>Painéis de produção</strong>
          <p>Uma visão dedicada para as telas da equipe.</p>
        </div>
        <Link to="/tv/cozinha">Cozinha </Link>
        <Link to="/tv/churrasqueira">Churrasqueira </Link>
        <Link to="/tv/bar">Bar </Link>
      </div>
    </div>
  );
}
