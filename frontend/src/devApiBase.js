/** URL pública da API (Cloudflare Tunnel no PC do restaurante). */
export const DEFAULT_PRODUCTION_API = 'https://pdv.bosquecarne.work';

/**
 * Base da API (sem barra final).
 * Em dev, ao abrir o Vite pelo IP da rede (ex.: celular), usa http://<host>:3001 direto —
 * o proxy WebSocket do Vite para /socket.io costuma dar ECONNRESET nesse cenário.
 */
export function getApiBase() {
  const env = import.meta.env.VITE_API_URL;
  if (env != null && String(env).trim() !== '') {
    return String(env).replace(/\/$/, '');
  }
  if (!import.meta.env.DEV) return import.meta.env.VITE_PUBLIC_ONLY ? DEFAULT_PRODUCTION_API : '';
  if (typeof window === 'undefined') return '';
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return '';
  return `http://${h}:3001`;
}
