import { getApiBase } from "../devApiBase";
import { useState, useEffect } from "react";
import { getSocket } from "../socket";
const STORAGE_KEY = "pdv_bosque_waiter";
import {WaiterContext} from './useWaiter';
function savedWaiter() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return data?.name && data?.token && data.expires > Date.now() ? data : null;
  } catch {
    return null;
  }
}
export function WaiterProvider({ children }) {
  const [waiter, setWaiterState] = useState(savedWaiter);
  const setWaiter = (data) => {
    setWaiterState(data);
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
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
