import {createContext,useContext} from 'react';
export const WaiterContext=createContext(null);
export function useWaiter() {
  const ctx = useContext(WaiterContext);
  if (!ctx) throw new Error("useWaiter must be used inside WaiterProvider");
  return ctx;
}
