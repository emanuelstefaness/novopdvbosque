import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { businessDate } from "../utils/businessDate";
import { useSocket } from "../socket";
import Icon from "../components/Icon";
import {
  getFinanceDaily,
  getFinanceEntries,
  postFinanceExpense,
  postFinanceIncomeManual,
  deleteFinanceExpense,
  deleteFinanceIncomeManual,
} from "../api";
const money = (n) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const dateBR = (s) => String(s).slice(0, 10).split("-").reverse().join("/");
const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function rangeFor(mode, anchor = businessDate()) {
  const [y, m, d] = anchor.split("-").map(Number),
    date = new Date(y, m - 1, d);
  if (mode === "day") return { from: anchor, to: anchor };
  if (mode === "week") {
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    return { from: toISO(date), to: toISO(end) };
  }
  return { from: toISO(new Date(y, m - 1, 1)), to: toISO(new Date(y, m, 0)) };
}
const kinds = {
  sales: "Vendas",
  expense: "Despesa",
  income_manual: "Entrada manual",
};
export default function Financeiro() {
  const [period, setPeriod] = useState(() => ({
    ...rangeFor("month"),
    mode: "month",
  }));
  const [data, setData] = useState(null),
    [entries, setEntries] = useState({ expenses: [], income_manual: [] });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [view, setView] = useState("ledger"),
    [kind, setKind] = useState("all"),
    [search, setSearch] = useState("");
  const [form, setForm] = useState(null),
    [formError, setFormError] = useState(""),
    [saving, setSaving] = useState(false),
    [deleting, setDeleting] = useState(null);
  const request = useRef(0),
    { from, to } = period,
    valid = !!from && !!to && from <= to;
  const load = useCallback(async () => {
    const id = ++request.current;
    if (!from || !to || from > to) {
      setError("Informe um período válido: início anterior ou igual ao fim.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [daily, manual] = await Promise.all([
        getFinanceDaily(from, to),
        getFinanceEntries(from, to),
      ]);
      if (id !== request.current) return;
      setData(daily);
      setEntries(manual);
    } catch (e) {
      if (id === request.current) {
        setError(e.message || "Não foi possível carregar os lançamentos.");
        setData(null);
      }
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useSocket(() => void load());
  const rows = useMemo(() => {
    const automatic = (data?.daily || []).flatMap((d) => [
      ...(d.sales_comandas
        ? [
            {
              key: "salon-" + d.business_date,
              business_date: d.business_date,
              description: "Vendas do salão",
              detail: "Recebimentos das comandas",
              kind: "sales",
              amount: d.sales_comandas,
              automatic: true,
            },
          ]
        : []),
      ...(d.sales_online
        ? [
            {
              key: "online-" + d.business_date,
              business_date: d.business_date,
              description: "Pedidos online entregues",
              detail: "Delivery e retirada",
              kind: "sales",
              amount: d.sales_online,
              automatic: true,
            },
          ]
        : []),
    ]);
    return [
      ...automatic,
      ...entries.expenses.map((e) => ({
        ...e,
        key: "expense-" + e.id,
        kind: "expense",
      })),
      ...entries.income_manual.map((e) => ({
        ...e,
        key: "income-" + e.id,
        kind: "income_manual",
      })),
    ].sort(
      (a, b) =>
        b.business_date.localeCompare(a.business_date) ||
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
    );
  }, [data, entries]);
  const visible = rows.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      (!search ||
        `${r.description} ${r.detail || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR"))),
  );
  const filteredTotals = visible.reduce(
    (a, r) => {
      a[r.kind === "expense" ? "expense" : "income"] += Math.round(
        Number(r.amount) * 100,
      );
      return a;
    },
    { income: 0, expense: 0 },
  );
  const totals = valid && !error ? data?.totals : null;
  const preset = (mode) => setPeriod({ ...rangeFor(mode), mode });
  const moveWeek = (direction) => {
    const [y, m, d] = from.split("-").map(Number);
    setPeriod({
      ...rangeFor("week", toISO(new Date(y, m - 1, d + direction * 7))),
      mode: "week",
    });
  };
  const openForm = (type) => {
    setForm({
      kind: type,
      business_date: businessDate(),
      description: "",
      amount: "",
    });
    setFormError("");
  };
  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    const amount = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Informe um valor maior que zero.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await (
        form.kind === "expense" ? postFinanceExpense : postFinanceIncomeManual
      )({
        business_date: form.business_date,
        description: form.description.trim(),
        amount,
      });
      const date = form.business_date;
      setForm(null);
      if (date < from || date > to)
        setPeriod({ mode: "day", from: date, to: date });
      else await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (saving || !deleting) return;
    setSaving(true);
    setFormError("");
    try {
      await (
        deleting.kind === "expense"
          ? deleteFinanceExpense
          : deleteFinanceIncomeManual
      )(deleting.id);
      setDeleting(null);
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="ledger-page">
      <header className="ledger-heading">
        <div>
          <h1>Financeiro</h1>
          <p>Livro-caixa do restaurante</p>
        </div>
        <div>
          <button
            className="btn btn-secondary"
            onClick={() => openForm("income_manual")}
          >
            <Icon name="plus" size={17} />
            Nova entrada
          </button>
          <button
            className="btn btn-primary"
            onClick={() => openForm("expense")}
          >
            <Icon name="plus" size={17} />
            Nova despesa
          </button>
        </div>
      </header>
      <section className="ledger-book">
        <div className="ledger-period">
          <div className="ledger-period-presets">
            {[
              ["day", "Hoje"],
              ["week", "Semana"],
              ["month", "Mês"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={period.mode === id ? "selected" : ""}
                onClick={() => preset(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ledger-date-fields">
            <label>
              De
              <input
                aria-label="Data inicial"
                type="date"
                value={from}
                onChange={(e) =>
                  setPeriod((p) => ({
                    ...p,
                    from: e.target.value,
                    mode: "custom",
                  }))
                }
              />
            </label>
            <span>—</span>
            <label>
              Até
              <input
                aria-label="Data final"
                type="date"
                value={to}
                onChange={(e) =>
                  setPeriod((p) => ({
                    ...p,
                    to: e.target.value,
                    mode: "custom",
                  }))
                }
              />
            </label>
          </div>
          {period.mode === "week" && (
            <div className="ledger-week-navigation">
              <button aria-label="Semana anterior" onClick={() => moveWeek(-1)}>
                ‹
              </button>
              <button aria-label="Próxima semana" onClick={() => moveWeek(1)}>
                ›
              </button>
            </div>
          )}
          <button
            className="icon-button ledger-refresh"
            aria-label="Atualizar financeiro"
            onClick={() => void load()}
            disabled={loading}
          >
            <Icon name="refresh" size={18} />
          </button>
        </div>
        <div className="ledger-balance" aria-label="Totais do período">
          <div>
            <span>Entradas</span>
            <strong>
              {loading ? "…" : totals ? money(totals.entradas_total) : "—"}
            </strong>
          </div>
          <span className="ledger-operation">−</span>
          <div>
            <span>Despesas</span>
            <strong>
              {loading ? "…" : totals ? money(totals.expenses) : "—"}
            </strong>
          </div>
          <span className="ledger-operation">=</span>
          <div className="ledger-net">
            <span>Saldo do período</span>
            <strong className={totals?.lucro < 0 ? "negative" : ""}>
              {loading ? "…" : totals ? money(totals.lucro) : "—"}
            </strong>
          </div>
          <p>
            Movimentação registrada de {dateBR(from)} a {dateBR(to)}
            <br />
            <span>Dia operacional: 01:00 a 00:59.</span>
          </p>
        </div>
        <nav className="ledger-tabs" aria-label="Visualização financeira">
          <button
            className={view === "ledger" ? "selected" : ""}
            onClick={() => setView("ledger")}
          >
            Movimentações
          </button>
          <button
            className={view === "daily" ? "selected" : ""}
            onClick={() => setView("daily")}
          >
            Fechamento por dia
          </button>
        </nav>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {view === "ledger" ? (
          <>
            <div className="ledger-toolbar">
              <label className="ledger-search">
                <Icon name="search" size={17} />
                <input
                  placeholder="Buscar descrição"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                aria-label="Tipo de movimentação"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="all">Todas as movimentações</option>
                <option value="sales">Vendas</option>
                <option value="income_manual">Entradas manuais</option>
                <option value="expense">Despesas</option>
              </select>
              <span>
                {visible.length}{" "}
                {visible.length === 1 ? "registro" : "registros"}
              </span>
            </div>
            <div className="ledger-table-wrap" aria-busy={loading}>
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Origem</th>
                    <th className="numeric">Entrada</th>
                    <th className="numeric">Saída</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {!loading &&
                    valid &&
                    !error &&
                    visible.map((r) => (
                      <tr key={r.key}>
                        <td className="ledger-date">
                          {dateBR(r.business_date)}
                        </td>
                        <td>
                          <strong>{r.description}</strong>
                          {r.detail && <small>{r.detail}</small>}
                        </td>
                        <td>
                          <span className={`ledger-origin ${r.kind}`}>
                            {kinds[r.kind]}
                          </span>
                        </td>
                        <td className="numeric ledger-income">
                          {r.kind !== "expense" ? money(r.amount) : "—"}
                        </td>
                        <td className="numeric">
                          {r.kind === "expense" ? money(r.amount) : "—"}
                        </td>
                        <td>
                          {r.automatic ? (
                            <span
                              className="ledger-automatic"
                              title="Lançamento calculado a partir das vendas"
                            >
                              Automático
                            </span>
                          ) : (
                            <button
                              className="ledger-delete"
                              aria-label={`Excluir ${r.description}`}
                              onClick={() => {
                                setDeleting(r);
                                setFormError("");
                              }}
                            >
                              Excluir
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
                {!loading && valid && !error && visible.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan="3">Total dos registros exibidos</td>
                      <td className="numeric">
                        {money(filteredTotals.income / 100)}
                      </td>
                      <td className="numeric">
                        {money(filteredTotals.expense / 100)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {loading ? (
              <div className="ledger-empty" role="status">
                Carregando movimentações…
              </div>
            ) : (
              !error &&
              !visible.length && (
                <div className="ledger-empty">
                  <Icon name="book" size={30} />
                  <strong>Nenhuma movimentação encontrada</strong>
                  <p>Ajuste o período ou registre uma entrada ou despesa.</p>
                </div>
              )
            )}
          </>
        ) : (
          <div className="ledger-table-wrap" aria-busy={loading}>
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Dia operacional</th>
                  <th className="numeric">Salão</th>
                  <th className="numeric">Online</th>
                  <th className="numeric">Outras entradas</th>
                  <th className="numeric">Despesas</th>
                  <th className="numeric">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  valid &&
                  !error &&
                  (data?.daily || []).map((d) => (
                    <tr key={d.business_date}>
                      <td>{dateBR(d.business_date)}</td>
                      <td className="numeric">{money(d.sales_comandas)}</td>
                      <td className="numeric">{money(d.sales_online)}</td>
                      <td className="numeric">{money(d.income_manual)}</td>
                      <td className="numeric">{money(d.expenses)}</td>
                      <td
                        className={`numeric ${d.lucro < 0 ? "negative" : "ledger-income"}`}
                      >
                        <strong>{money(d.lucro)}</strong>
                      </td>
                    </tr>
                  ))}
              </tbody>
              {!loading && valid && !error && totals && (
                <tfoot>
                  <tr>
                    <td>Total do período</td>
                    <td className="numeric">{money(totals.sales_comandas)}</td>
                    <td className="numeric">{money(totals.sales_online)}</td>
                    <td className="numeric">{money(totals.income_manual)}</td>
                    <td className="numeric">{money(totals.expenses)}</td>
                    <td className="numeric">{money(totals.lucro)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            {loading && (
              <div className="ledger-empty">Carregando fechamento…</div>
            )}
          </div>
        )}
        <footer className="ledger-book-foot">
          <Icon name="receipt" size={15} />
          <span>
            Vendas agrupadas por dia. Entradas e despesas manuais discriminadas
            por lançamento.
          </span>
        </footer>
      </section>
      {form && (
        <div className="ledger-modal-backdrop">
          <section
            className="ledger-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ledger-form-title"
          >
            <header>
              <h2 id="ledger-form-title">
                {form.kind === "expense" ? "Nova despesa" : "Nova entrada"}
              </h2>
              <button
                className="icon-button"
                aria-label="Fechar lançamento"
                onClick={() => setForm(null)}
                disabled={saving}
              >
                <Icon name="close" />
              </button>
            </header>
            <form onSubmit={save}>
              <label>
                Data operacional
                <input
                  type="date"
                  required
                  value={form.business_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, business_date: e.target.value }))
                  }
                />
              </label>
              <label>
                Descrição
                <input
                  autoFocus
                  required
                  placeholder={
                    form.kind === "expense"
                      ? "Ex.: Compra de insumos"
                      : "Ex.: Entrada avulsa"
                  }
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </label>
              <label>
                Valor (R$)
                <input
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </label>
              {formError && (
                <p className="error-banner" role="alert">
                  {formError}
                </p>
              )}
              <footer>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setForm(null)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button className="btn btn-primary" disabled={saving}>
                  {saving ? "Salvando…" : "Salvar lançamento"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {deleting && (
        <div className="ledger-modal-backdrop">
          <section
            className="ledger-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ledger-delete-title"
          >
            <header>
              <h2 id="ledger-delete-title">Excluir lançamento?</h2>
            </header>
            <div className="ledger-delete-content">
              <p>{deleting.description}</p>
              <strong>{money(deleting.amount)}</strong>
              <p>
                {dateBR(deleting.business_date)} · {kinds[deleting.kind]}
              </p>
              {formError && <p className="error-banner">{formError}</p>}
            </div>
            <footer>
              <button
                className="btn btn-secondary"
                onClick={() => setDeleting(null)}
                disabled={saving}
              >
                Voltar
              </button>
              <button
                className="btn btn-danger"
                onClick={() => void remove()}
                disabled={saving}
              >
                {saving ? "Excluindo…" : "Confirmar exclusão"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
