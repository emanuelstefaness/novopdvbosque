import { lazy, Suspense } from "react";
import './operations.css';
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import {useWaiter} from "./context/useWaiter";
const Home = lazy(() => import("./pages/Home"));
const Garcons = lazy(() => import("./pages/Garcons"));
const Pedidos = lazy(() => import("./pages/Pedidos"));
const Cozinha = lazy(() => import("./pages/Cozinha"));
const Churrasqueira = lazy(() => import("./pages/Churrasqueira"));
const Bar = lazy(() => import("./pages/Bar"));
const Caixa = lazy(() => import("./pages/Caixa"));
const Admin = lazy(() => import("./pages/Admin"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Cardapio = lazy(() => import("./pages/Cardapio"));
const TvChurrasqueira = lazy(() => import("./pages/TvChurrasqueira"));
const TvCozinha = lazy(() => import("./pages/TvCozinha"));
const TvBar = lazy(() => import("./pages/TvBar"));
const PedirOnline = lazy(() => import("./pages/PedirOnline"));
const PedidosOnlineInterno = lazy(() => import("./pages/PedidosOnlineInterno"));
const PedirOnlineAcompanhar = lazy(
  () => import("./pages/PedirOnlineAcompanhar"),
);
const EspetinhosDemo = lazy(() => import("./demoEspetinhos/EspetinhosDemo"));

import AppShell from "./components/AppShell";
function RequerLogin({ children }) {
  const { waiter } = useWaiter();
  if (!waiter) return <Navigate to="/" replace />;
  return children;
}

// Rotas que garçom (não-caixa) não pode acessar; quem digitou "caixa" tem acesso total
function SemAcessoGarcom({ children }) {
  const { waiter } = useWaiter();
  if (!waiter) return <Navigate to="/" replace />;
  if (waiter && !waiter.isCaixa) return <Navigate to="/garcons" replace />;
  return children;
}

function App() {
  const { pathname } = useLocation();
  const { waiter } = useWaiter();
  const publicPage = pathname === "/pedir" || pathname === "/acompanhar" || pathname === "/demo-espetinhos";
  const tv = pathname.startsWith("/tv");
  const content = (
    <Suspense
      fallback={
        <div className="page-loading" role="status">
          Carregando área de trabalho…
        </div>
      }
    >
      {" "}
      <Routes>
        <Route path="/" element={waiter && !waiter.isCaixa ? <Navigate to="/garcons" replace /> : <Home />} />
        <Route path="/pedir" element={<PedirOnline />} />
        <Route path="/acompanhar" element={<PedirOnlineAcompanhar />} />
        <Route path="/demo-espetinhos" element={<EspetinhosDemo />} />
        <Route
          path="/garcons"
          element={
            <RequerLogin>
              <Garcons />
            </RequerLogin>
          }
        />
        <Route
          path="/garcons/:comandaId/pedidos"
          element={
            <RequerLogin>
              <Pedidos />
            </RequerLogin>
          }
        />
        <Route
          path="/cozinha"
          element={
            <SemAcessoGarcom>
              <Cozinha />
            </SemAcessoGarcom>
          }
        />
        <Route
          path="/churrasqueira"
          element={
            <SemAcessoGarcom>
              <Churrasqueira />
            </SemAcessoGarcom>
          }
        />
        <Route
          path="/bar"
          element={
            <SemAcessoGarcom>
              <Bar />
            </SemAcessoGarcom>
          }
        />
        <Route
          path="/caixa"
          element={
            <SemAcessoGarcom>
              <Caixa />
            </SemAcessoGarcom>
          }
        />
        <Route
          path="/cardapio"
          element={
            <SemAcessoGarcom>
              <Cardapio />
            </SemAcessoGarcom>
          }
        />
        <Route
          path="/pedidos-online"
          element={
            <SemAcessoGarcom>
              <PedidosOnlineInterno />
            </SemAcessoGarcom>
          }
        />
        <Route
          path="/admin"
          element={
            <SemAcessoGarcom>
              <Admin />
            </SemAcessoGarcom>
          }
        />
        <Route
          path="/financeiro"
          element={
            <SemAcessoGarcom>
              <Financeiro />
            </SemAcessoGarcom>
          }
        />
        <Route
          path="/tv/churrasqueira"
          element={
            <SemAcessoGarcom>
              <TvChurrasqueira />
            </SemAcessoGarcom>
          }
        />
        <Route
          path="/tv/cozinha"
          element={
            <SemAcessoGarcom>
              <TvCozinha />
            </SemAcessoGarcom>
          }
        />
        <Route
          path="/tv/bar"
          element={
            <SemAcessoGarcom>
              <TvBar />
            </SemAcessoGarcom>
          }
        />
      </Routes>
    </Suspense>
  );
  if (publicPage) return <div className="public-app">{content}</div>;
  if (tv) return <div className="tv-app">{content}</div>;
  if (!waiter) return content;
  return <AppShell>{content}</AppShell>;
}
export default App;
