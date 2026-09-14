import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getComandas, openComanda } from "../api";
import { useSocket } from "../socket";
import {useWaiter} from "../context/useWaiter";
import Icon from "../components/Icon";
const open = (c) =>
  c && !c.closed_at && ["open", "ordering", "paying"].includes(c.status);
const labels = {
  open: "Aberta",
  ordering: "Em atendimento",
  paying: "Pagamento",
  closed: "Disponível",
};
export default function Garcons() {
  const navigate = useNavigate(),
    { waiter } = useWaiter();
  const [data, setData] = useState({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("ativas"),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState(null),
    [mesa, setMesa] = useState(""),
    [saving, setSaving] = useState(false);
  const load = async () => {
    try {
      setData(await getComandas());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useSocket(() => void load());
  const all = Array.from(
      { length: 200 },
      (_, i) => data[i + 1] || { id: i + 1, status: "closed" },
    ),
    active = all.filter(open);
  const choose = (c) => {
    if (open(c)) {
      navigate(`/garcons/${c.id}/pedidos`);
      return;
    }
    setMesa(c.mesa || "");
    setModal(c);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!mesa.trim() || saving) return;
    setSaving(true);
    try {
      await openComanda(modal.id, mesa.trim(), waiter?.id ?? null);
      navigate(`/garcons/${modal.id}/pedidos`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const visible = all.filter(
    (c) =>
      (filter === "todas" || (filter === "ativas" ? open(c) : !open(c))) &&
      (!search ||
        String(c.id).includes(search) ||
        String(c.mesa || "").includes(search)),
  );
  return (
    <div>
      <header className="page-heading">
        <div>
          {waiter.isCaixa && <span className="eyebrow">ATENDIMENTO</span>}
          <h1>Mesas e comandas</h1>
          {waiter.isCaixa && <p>O salão organizado. Do primeiro pedido ao fechamento.</p>}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            const c = all.find((c) => !open(c));
            if (c) choose(c);
          }}
          disabled={active.length === 200}
        >
          <Icon name="plus" size={18} />
          Abrir comanda
        </button>
      </header>
      <div className="work-toolbar">
        <div className="segmented">
          {[
            ["ativas", "Em atendimento", active.length],
            ["livres", "Disponíveis", 200 - active.length],
            ["todas", "Todas", 200],
          ].map(([key, label, n]) => (
            <button
              key={key}
              className={filter === key ? "selected" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="count">{n}</span>
            </button>
          ))}
        </div>
        <label className="search-field">
          <Icon name="search" size={18} />
          <input
            placeholder="Buscar mesa ou comanda"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="icon-button" onClick={load} aria-label="Atualizar">
          <Icon name="refresh" size={18} />
        </button>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="table-legend">
        <span>
          <i className="status-dot green" />
          Em atendimento
        </span>
        <span>
          <i className="status-dot amber" />
          Pagamento
        </span>
        <span>
          <i className="status-dot gray" />
          Disponível
        </span>
      </div>
      {loading ? (
        <div className="empty-panel">Carregando comandas…</div>
      ) : (
        <div className="comanda-grid">
          {visible.map((c) => (
            <button
              className={`comanda-tile ${open(c) ? c.status : "closed"}`}
              key={c.id}
              onClick={() => choose(c)}
            >
              <div className="tile-top">
                <Icon name="receipt" size={19} />
                <span className="tile-status">
                  <i />
                  {labels[open(c) ? c.status : "closed"]}
                </span>
              </div>
              <div className="tile-number">{String(c.id).padStart(2, "0")}</div>
              <div className="tile-bottom">
                <span>{open(c) ? `Mesa ${c.mesa}` : "Abrir atendimento"}</span>
                {open(c) ? (
                  <strong>
                    {Number(c.total_pedidos || 0).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </strong>
                ) : (
                  <Icon name="plus" size={17} />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      {!loading && !visible.length && (
        <div className="empty-panel">
          <Icon name="receipt" size={34} />
          <h2>
            {search
              ? "Nenhuma comanda encontrada"
              : "Nenhuma comanda em atendimento"}
          </h2>
          <p>
            {search
              ? "Tente outro número de mesa ou comanda."
              : "Use “Abrir comanda” para iniciar uma nova mesa."}
          </p>
        </div>
      )}
      {modal && (
        <div className="dialog-backdrop">
          <form className="dialog-card" onSubmit={submit}>
            <div className="dialog-title">
              <h2>Abrir comanda {modal.id}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label="Fechar"
              >
                <Icon name="close" />
              </button>
            </div>
            <p>Informe a mesa deste atendimento.</p>
            <label className="field-label">
              Número da mesa
              <input
                autoFocus
                required
                value={mesa}
                onChange={(e) => setMesa(e.target.value)}
                placeholder="Ex.: 12"
              />
            </label>
            {error && <p className="error-banner">{error}</p>}
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? "Abrindo…" : "Abrir e lançar pedidos"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
