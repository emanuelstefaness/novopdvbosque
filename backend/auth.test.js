import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
process.env.PDV_CAIXA_PASSWORD = "senha-somente-teste";
// Banco em memória: o login do garçom grava em "waiters" e não pode tocar no banco real.
process.env.PDV_DB_PATH = ":memory:";
const { initDb } = await import("./db.js");
initDb();
const { authRouter, authorize, sessionFor } = await import("./auth.js");
const app = express();
app.use(express.json());
app.use("/auth", authRouter);
app.use(authorize);
app.all("*", (req, res) => res.json({ ok: true, role: req.user.role }));
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const request = (path, method = "GET", body, token) =>
  fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
test("API exige sessão e recusa senha incorreta", async () => {
  assert.equal((await request("/reports/faturamento")).status, 401);
  assert.equal(
    (
      await request("/auth/login", "POST", {
        role: "caixa",
        password: "errada",
      })
    ).status,
    401,
  );
});
test("Caixa acessa gestão e logout invalida a sessão no servidor", async () => {
  const login = await request("/auth/login", "POST", {
    role: "caixa",
    password: process.env.PDV_CAIXA_PASSWORD,
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.ok(sessionFor(token)?.isCaixa);
  assert.equal(
    (await request("/reports/faturamento", "GET", null, token)).status,
    200,
  );
  await request("/auth/logout", "POST", null, token);
  assert.equal(
    (await request("/reports/faturamento", "GET", null, token)).status,
    401,
  );
});
test("Garçom precisa informar o nome para entrar", async () => {
  assert.equal(
    (await request("/auth/login", "POST", { role: "garcom" })).status,
    400,
  );
  assert.equal(
    (await request("/auth/login", "POST", { role: "garcom", name: " " })).status,
    400,
  );
  const ok = await request("/auth/login", "POST", {
    role: "garcom",
    name: "  Maria   Silva ",
  });
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.name, "Maria Silva");
  assert.ok(data.token);
});
test("Garçom mantém atendimento e não recebe permissões de caixa", async () => {
  const { token } = await (
    await request("/auth/login", "POST", { role: "garcom", name: "Teste Garçom" })
  ).json();
  assert.equal((await request("/comandas", "GET", null, token)).status, 200);
  assert.equal(
    (await request("/pedidos", "POST", { comanda_id: 1, item_id: 1 }, token))
      .status,
    200,
  );
  assert.equal(
    (await request("/comandas/1", "PATCH", { status: "paying" }, token)).status,
    200,
  );
  for (const path of ["/reports/faturamento", "/orders", "/finance/daily"])
    assert.equal((await request(path, "GET", null, token)).status, 403);
  assert.equal(
    (await request("/comandas/1", "PATCH", { status: "closed" }, token)).status,
    403,
  );
  assert.equal(
    (await request("/comandas/1", "PATCH", { service_tax_percent: 100 }, token))
      .status,
    403,
  );
});
test.after(() => server.close());
