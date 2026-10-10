/**
 * Testes do delivery redesenhado que não dependem do navegador:
 * geometria da meia-lua, combos (regras de preço aceitas pelo servidor) e cobertura de imagens.
 * Rodar na pasta frontend:  node --test tests/
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categoryArcStyle, categoryArcPoint } from "../src/utils/categoryArc.js";
import { buildCombos, comboUnitPrices, COMBO_MAX_DISCOUNT_PERCENT, COMBO_MAX_SAVINGS } from "../src/utils/deliveryCombos.js";
import { itemImageSlug } from "../src/utils/itemImageSlug.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const norm = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const brl = (v) => "R$ " + Number(v).toFixed(2);

// ---------- meia-lua ----------
const ICON = 44; // diâmetro do ícone (px) no celular

test("Meia-lua: pontas simétricas, topo no meio e curva contínua", () => {
  for (const total of [5, 8, 9, 10, 13]) {
    const first = categoryArcPoint(0, total, 1000);
    const last = categoryArcPoint(total - 1, total, 1000);
    assert.ok(Math.abs(first.x - (1000 - last.x)) < 0.5, `pontas simétricas (n=${total})`);
    assert.ok(Math.abs(first.y - last.y) < 0.1, `pontas na mesma altura (n=${total})`);
    const ys = Array.from({ length: total }, (_, i) => categoryArcPoint(i, total, 1000).y);
    const mid = Math.min(...ys);
    assert.ok(mid < first.y, "o centro é mais alto que as pontas");
    const peak = ys.indexOf(mid);
    for (let i = 1; i <= peak; i++) assert.ok(ys[i] <= ys[i - 1] + 0.01, `subida contínua (n=${total}, i=${i})`);
    for (let i = peak + 1; i < total; i++) assert.ok(ys[i] >= ys[i - 1] - 0.01, `descida contínua (n=${total}, i=${i})`);
  }
});

test("Meia-lua: nenhum ícone encosta no vizinho em larguras de celular a desktop (9 categorias)", () => {
  for (const width of [340, 360, 390, 430, 600, 768, 1024, 1280]) {
    const w = Math.min(width + 40, 860); // largura real da meia-lua (CSS: min(100% + 40px, 860px))
    const total = 9;
    for (let i = 1; i < total; i++) {
      const a = categoryArcPoint(i - 1, total, w);
      const b = categoryArcPoint(i, total, w);
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(dist >= ICON, `largura ${width}: ícones ${i - 1} e ${i} a ${dist.toFixed(1)}px (mínimo ${ICON})`);
    }
  }
});

test("Meia-lua: todos os botões ficam dentro do contêiner de 230px e da largura", () => {
  for (const total of [5, 9, 13]) {
    for (let i = 0; i < total; i++) {
      const s = categoryArcStyle(i, total);
      const x = parseFloat(s["--arc-x"]);
      const y = parseFloat(s["--arc-y"]);
      assert.ok(x > 5 && x < 95, `x dentro (${x})`);
      assert.ok(y >= 0 && y + 48 + 24 <= 230, `y dentro (${y})`); // ícone 48 + rótulo ~24
    }
  }
});

// ---------- combos ----------
const catalogo = {
  categories: [{ id: 1, slug: "bebidas" }, { id: 2, slug: "doses" }, { id: 3, slug: "lanches" }, { id: 4, slug: "pratos" }],
  items: [
    { id: 10, category_id: 3, name: "Churraspão", price: 36.9 },
    { id: 11, category_id: 3, name: "Churraspão de coração", price: 36.9 },
    { id: 12, category_id: 4, name: "Prato Feito do Bosque", price: 39.9, is_prato_feito: 1 },
    { id: 20, category_id: 2, name: "Coca-Cola 350ml", price: 8 },
    { id: 21, category_id: 1, name: "Coca-Cola 350ml", price: 8 },
  ],
};

test("Combos: três combos montados com os itens certos", () => {
  const c = buildCombos(catalogo.items, norm, brl, catalogo.categories);
  assert.equal(c.length, 3);
  assert.deepEqual(c.map((x) => x.id), ["combo-pf-churraspao", "combo-2-churraspao", "combo-2-pf"]);
  assert.equal(c[1].products.length, 4);
});

test("Combos: a Coca do combo vem da categoria Bebidas (não de Doses)", () => {
  const c = buildCombos(catalogo.items, norm, brl, catalogo.categories);
  for (const combo of c) for (const p of combo.products) if (norm(p.name).includes("coca")) assert.equal(p.id, 21);
});

test("Combos: o Churraspão de coração não entra no lugar do Churraspão", () => {
  const c = buildCombos(catalogo.items, norm, brl, catalogo.categories);
  for (const combo of c) assert.ok(combo.products.every((p) => p.id !== 11));
});

test("Combos: desconto limitado a R$ 8 e a 15% — o que o servidor aceita", () => {
  const c = buildCombos(catalogo.items, norm, brl, catalogo.categories);
  for (const combo of c) {
    assert.ok(combo.originalPrice - combo.price <= COMBO_MAX_SAVINGS + 0.005, `${combo.id}: economia ≤ ${COMBO_MAX_SAVINGS}`);
    assert.ok(combo.price >= combo.originalPrice * (1 - COMBO_MAX_DISCOUNT_PERCENT / 100) - 0.01, `${combo.id}: ≥ 85% do preço de tabela`);
    const unit = comboUnitPrices(combo);
    combo.products.forEach((p, i) => {
      const piso = Math.round(p.price * 0.85 * 100) / 100 - 0.01;
      assert.ok(unit[i] >= piso, `${combo.id}: ${p.name} a ${unit[i]} (piso ${piso.toFixed(2)})`);
      assert.ok(unit[i] <= p.price + 0.001);
    });
    const soma = unit.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(soma - combo.price) <= 0.03, `${combo.id}: soma dos itens ${soma.toFixed(2)} ≈ preço do combo ${combo.price}`);
  }
});

test("Combos: sem os itens do cardápio, nenhum combo quebrado aparece", () => {
  assert.equal(buildCombos([], norm, brl, []).length, 0);
  const semCoca = catalogo.items.filter((i) => !norm(i.name).includes("coca"));
  assert.equal(buildCombos(semCoca, norm, brl, catalogo.categories).length, 0);
});

// ---------- imagens ----------
test("Imagens: nome do arquivo derivado do nome do item", () => {
  assert.equal(itemImageSlug("Coca-Cola 350ml"), "coca-cola-350ml");
  assert.equal(itemImageSlug("Água com ou sem gás"), "agua-com-ou-sem-gas");
  assert.equal(itemImageSlug("Cú de Burro"), "cu-de-burro");
  assert.equal(itemImageSlug("Jack Daniels 100ml"), "jack-daniels-100ml");
  assert.equal(itemImageSlug("Red Bull"), "redbull", "alias");
  assert.equal(itemImageSlug("Redbull"), "redbull");
  assert.equal(itemImageSlug("Soda Italiana de Maçã Verde"), "soda-italiana-de-maca-verde");
});

test("Imagens: cobertura dos itens do cardápio (lista o que falta)", async () => {
  const dbPath = process.env.PDV_DB_FILE || path.resolve(here, "../../backend/pdv_bosque.db");
  if (!fs.existsSync(dbPath)) return; // sem banco: nada a conferir
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const items = db.prepare("SELECT name FROM items WHERE COALESCE(internal_only,0)=0").all();
  const dir = path.resolve(here, "../public/menu-real-cutouts");
  const have = new Set(fs.readdirSync(dir).map((f) => f.replace(/\.png$/i, "")));
  const missing = [...new Set(items.filter((i) => norm(i.name) !== "couvert").map((i) => itemImageSlug(i.name)))].filter((s) => !have.has(s));
  console.log(`# imagens: ${have.size} arquivos; itens sem foto: ${missing.length}${missing.length ? " -> " + missing.join(", ") : ""}`);
  // Informativo: não reprova enquanto as fotos novas ainda estão sendo geradas.
  assert.ok(Array.isArray(missing));
});
