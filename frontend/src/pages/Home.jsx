import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import {useWaiter} from "../context/useWaiter";
import { getComandas, getOrders, loginOperator } from "../api";
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
export default function Home() {
  const { waiter, setWaiter } = useWaiter();
  const [mode, setMode] = useState("caixa"),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const [comandas, setComandas] = useState({}),
    [orders, setOrders] = useState([]);
  const load = async () => {
    if (!waiter) return;
    try {
      const [c, o] = await Promise.all([
        getComandas(),
        waiter.isCaixa ? getOrders() : Promise.resolve([]),
      ]);
      setComandas(c);
      setOrders(o);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    const initial=setTimeout(()=>void load(),0);
    return()=>clearTimeout(initial);
  }, [waiter]);
  useSocket(() => void load());
  const login = async (e) => {
    e.preventDefault();
    try {
      const user = await loginOperator(mode, password);
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
          <img className="establishment-logo login-logo" src="/logo-bosque-transparente.png" alt="Bosque da Carne" />
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
              <div className="login-note">
                Acesso a mesas, comandas e lançamento de pedidos.
              </div>
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

