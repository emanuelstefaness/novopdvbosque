import { useState, useEffect } from "react";
import { NavLink, useLocation, Link } from "react-router-dom";
import {useWaiter} from "../context/useWaiter";
import { getSocket } from "../socket";
import Icon from "./Icon";
const groups = [
  [
    "Atendimento",
    [
      ["/", "Visão geral", "grid"],
      ["/garcons", "Mesas e comandas", "receipt"],
      ["/caixa", "Frente de caixa", "wallet"],
      ["/pedidos-online", "Pedidos online", "orders"],
    ],
  ],
  [
    "Produção",
    [
      ["/cozinha", "Cozinha", "chef"],
      ["/churrasqueira", "Churrasqueira", "flame"],
      ["/bar", "Bar", "cup"],
    ],
  ],
  [
    "Gestão",
    [
      ["/cardapio", "Cardápio", "book"],
      ["/itens-ifood", "Itens do iFood", "orders"],
      ["/admin", "Relatórios", "chart"],
      ["/financeiro", "Financeiro", "wallet"],
    ],
  ],
];
export default function AppShell({ children }) {
  const { waiter, logout } = useWaiter(),
    location = useLocation();
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => {
    const s = getSocket(),
      on = () => setConnected(true),
      off = () => setConnected(false);
    s.on("connect", on);
    s.on("disconnect", off);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
    };
  }, []);
  if (!waiter.isCaixa) {
    return (
      <div className="pdv-app waiter-app">
        <header className="waiter-topbar">
          <Link to="/garcons" className="waiter-comandas-link"><Icon name="receipt" size={20} />Comandas</Link>
          <div className="waiter-topbar-actions">
            <span className={`connection ${connected ? "connected" : ""}`}><i />{connected ? "Conectado" : "Reconectando"}</span>
            <button type="button" className="icon-button" onClick={logout} aria-label="Sair" title="Sair"><Icon name="logout" size={18} /></button>
          </div>
        </header>
        <main className={`app-content page-${location.pathname.split('/')[1] || 'garcons'}`}>{children}</main>
      </div>
    );
  }
  const activeGroup =
    groups.find(([, links]) => links.some(([path]) => path === location.pathname)) ||
    groups[0];
  return (
    <div className="pdv-app pdv-app-ribbon">
      <header className="app-ribbon">
        <div className="ribbon-top">
          <Link className="app-brand ribbon-brand" to="/">
            <img className="establishment-logo ribbon-logo" src="/logo-bosque-transparente-256.png" alt="Bosque da Carne" />
          </Link>
          <nav className="ribbon-tabs" aria-label="Menu principal">
            {groups.map(([title, links]) => (
              <Link
                key={title}
                to={links[0][0]}
                className={`ribbon-tab ${activeGroup[0] === title ? "active" : ""}`}
              >
                {title}
              </Link>
            ))}
          </nav>
          <div className="topbar-right">
            <span className={`connection ${connected ? "connected" : ""}`}>
              <i />
              {connected ? "Conectado" : "Reconectando"}
            </span>
            <span className="topbar-date">
              {new Date().toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
              })}
            </span>
            <Link to="/pedir" className="icon-button" aria-label="Ver cardápio online" title="Ver cardápio online">
              <Icon name="book" size={18} />
            </Link>
            <button type="button" className="icon-button" onClick={logout} aria-label="Bloquear ou trocar usuário" title="Bloquear ou trocar usuário">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
        <nav className="ribbon-sub" aria-label={activeGroup[0]}>
          {activeGroup[1].map(([path, label, icon]) => (
            <NavLink
              end={path === "/"}
              key={path}
              to={path}
              className={({ isActive }) => `ribbon-sub-item ${isActive ? "active" : ""}`}
            >
              <Icon name={icon} size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main
        className={`app-content page-${location.pathname.split("/")[1] || "home"}`}
      >
        {children}
      </main>
      <footer className="app-footer">
        <span>Bosque da Carne</span>
        <span>Gestão do restaurante</span>
      </footer>
    </div>
  );
}
