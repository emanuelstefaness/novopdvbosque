import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { Router } from "express";
const sessions = new Map();
const password =
  process.env.PDV_CAIXA_PASSWORD || randomBytes(12).toString("base64url");
export function announceAccess() {
  if (!process.env.PDV_CAIXA_PASSWORD)
    console.log(
      `Senha temporária do caixa: ${password}\nPara manter uma senha, configure PDV_CAIXA_PASSWORD no arquivo backend/.env.`,
    );
}
const digest = (s) => createHash("sha256").update(String(s)).digest();
export function sessionFor(token) {
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}
export function rateLimit(max, period = 60000) {
  const map = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    if (map.size > 2000)
      for (const [k, v] of map) if (v.until < now) map.delete(k);
    let entry = map.get(key);
    if (!entry || entry.until < now) {
      entry = { n: 0, until: now + period };
      map.set(key, entry);
    }
    if (++entry.n > max)
      return res
        .status(429)
        .json({
          error: "Muitas tentativas. Aguarde um minuto e tente novamente.",
        });
    next();
  };
}
export const authRouter = Router();
authRouter.post("/login", rateLimit(20), (req, res) => {
  const role = req.body?.role === "garcom" ? "garcom" : "caixa";
  if (
    role === "caixa" &&
    !timingSafeEqual(digest(req.body?.password || ""), digest(password))
  )
    return res.status(401).json({ error: "Senha incorreta. Tente novamente." });
  const token = randomBytes(32).toString("hex");
  const session = {
    role,
    name: role === "caixa" ? "Caixa" : "Garçom",
    isCaixa: role === "caixa",
    expires: Date.now() + 12 * 3600000,
  };
  sessions.set(token, session);
  res.json({ ...session, token });
});
authRouter.post("/logout", (req, res) => {
  sessions.delete(
    String(req.headers.authorization || "").replace(/^Bearer /, ""),
  );
  res.json({ ok: true });
});
export function authorize(req, res, next) {
  const session = sessionFor(
    String(req.headers.authorization || "").replace(/^Bearer /, ""),
  );
  if (!session)
    return res.status(401).json({ error: "Entre no sistema para continuar." });
  req.user = session;
  if (session.isCaixa) return next();
  const p = req.path,
    m = req.method;
  const allowed =
    (m === "GET" &&
      (/^\/menu(?:\/|$)/.test(p) ||
        /^\/comandas(?:\/|$)/.test(p) ||
        /^\/pedidos\/by-comanda\//.test(p))) ||
    (m === "POST" &&
      (p === "/pedidos" ||
        p === "/waiters/by-name" ||
        /^\/comandas\/\d+\/open$/.test(p))) ||
    (m === "PATCH" &&
      /^\/comandas\/\d+$/.test(p) &&
      Object.keys(req.body || {}).every(
        (k) => k === "mesa" || (k === "status" && req.body.status === "paying"),
      )) ||
    (m === "PATCH" &&
      /^\/pedidos\/\d+$/.test(p) &&
      Object.keys(req.body || {}).every((k) =>
        ["quantity", "observations"].includes(k),
      )) ||
    (m === "DELETE" && /^\/pedidos\/\d+$/.test(p));
  if (!allowed)
    return res
      .status(403)
      .json({ error: "Esta operação requer acesso do caixa." });
  next();
}
