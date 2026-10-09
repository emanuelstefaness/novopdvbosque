import { getApiBase } from "../devApiBase";
import { useState, useEffect } from "react";
import { getSocket } from "../socket";
const STORAGE_KEY = "pdv_bosque_waiter";
import {WaiterContext} from './useWaiter';
function readStore(store) {
  try {
    const data = JSON.parse(store.getItem(STORAGE_KEY));
    return data?.name && data?.token && data.expires > Date.now() ? data : null;
  } catch {
    return null;
  }
}
// Caixa: lembra por 12h (localStorage). Garçom: fica só na aba/app aberto (sessionStorage),
// então ao abrir o sistema de novo ele informa o nome outra vez.
function savedWaiter() {
  return readStore(sessionStorage) || readStore(localStorage);
}
export function WaiterProvider({ children }) {
  const [waiter, setWaiterState] = useState(savedWaiter);
  const setWaiter = (data) => {
    setWaiterState(data);
    if (data) {
      const store = data.isCaixa ? localStorage : sessionStorage;
      const other = data.isCaixa ? sessionStorage : localStorage;
      store.setItem(STORAGE_KEY, JSON.stringify(data));
      other.removeItem(STORAGE_KEY);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    }
    const s = getSocket();
    s.disconnect();
    s.auth = { token: data?.token };
    if (data?.token) s.connect();
  };
  useEffect(() => {
    const expire = () => setWaiter(null);
    window.addEventListener("pdv-session-expired", expire);
    return () => window.removeEventListener("pdv-session-expired", expire);
  }, []);
  return (
    <WaiterContext.Provider
      value={{
        waiter,
        setWaiter,
        logout: () => {
          const token = waiter?.token;
          setWaiter(null);
          if (token)
            void fetch(getApiBase() + "/api/auth/logout", {
              method: "POST",
              headers: { Authorization: "Bearer " + token },
            }).catch(() => undefined);
        },
      }}
    >
      {children}
    </WaiterContext.Provider>
  );
}
