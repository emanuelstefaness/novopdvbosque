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
      ["/admin", "Relatórios", "chart"],
      ["/financeiro", "Financeiro", "wallet"],
    ],
  ],
];
export default function AppShell({ children }) {
  const { waiter, logout } = useWaiter(),
    location = useLocation();
  const [open, setOpen] = useState(false),
    [connected, setConnected] = useState(() => getSocket().connected);
  const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem('pdv-menu-collapsed')==='true'}catch{return false}});
  const toggleDesktopMenu=()=>{const next=!collapsed;setCollapsed(next);try{localStorage.setItem('pdv-menu-collapsed',String(next))}catch{/* Preferência opcional. */}};
  useEffect(()=>{const close=e=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[]);
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
  const current =
    groups.flatMap((g) => g[1]).find((x) => x[0] === location.pathname)?.[1] ||
    "Lançar pedidos";
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
  return (
    <div className={`pdv-app ${collapsed?'menu-collapsed':''}`}>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <aside id="app-navigation" className={`app-sidebar ${open ? "is-open" : ""}`}>
        <Link className="app-brand" to="/" onClick={() => setOpen(false)}>
          <img className="establishment-logo sidebar-logo" src="/logo-bosque-transparente.png" alt="Bosque da Carne" />
        </Link>
        <div className="store-label">
          <span className="store-avatar">BC</span>
          <div>
            <strong>Bosque da Carne</strong>
            <small>Operação do restaurante</small>
          </div>
        </div>
        <nav aria-label="Menu principal">
          {groups.map(([title, links]) => (
            <div className="nav-group" key={title}>
              <p>{title}</p>
              {links
                .filter(
                  ([path]) =>
                    waiter?.isCaixa || path === "/" || path === "/garcons",
                )
                .map(([path, label, icon]) => (
                  <NavLink
                    end={path === "/"}
                    key={path}
                    to={path}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `nav-item ${isActive ? "active" : ""}`
                    }
                  >
                    <Icon name={icon} />
                    <span>{label}</span>
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/pedir" className="nav-item">
            <Icon name="book" />
            <span>Ver cardápio online</span>
            <Icon name="arrow" size={15} />
          </Link>
          <div className="profile-row">
            <span className="profile-avatar">
              <Icon name="user" size={18} />
            </span>
            <div>
              <strong>
                {waiter?.isCaixa ? "Operador de caixa" : waiter?.name}
              </strong>
              <small>
                {waiter?.isCaixa ? "Caixa e produção" : "Atendimento"}
              </small>
            </div>
            <button onClick={logout} title="Sair" aria-label="Sair">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <div className="topbar-left">
            <button type="button" className="desktop-menu icon-button" onClick={toggleDesktopMenu} aria-label={collapsed?'Abrir menu':'Recolher menu'} aria-expanded={!collapsed} aria-controls="app-navigation" title={collapsed?'Abrir menu':'Recolher menu'}><Icon name="menu" /></button>
            <button
              className="mobile-menu icon-button"
              onClick={() => setOpen(value=>!value)}
              aria-label={open?'Recolher menu':'Abrir menu'}
              aria-expanded={open}
              aria-controls="app-navigation"
            >
              <Icon name="menu" />
            </button>
            <span className="breadcrumb">
              Operação <span>/</span> <strong>{current}</strong>
            </span>
          </div>
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
          </div>
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
    </div>
  );
}

