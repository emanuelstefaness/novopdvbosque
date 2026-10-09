import Icon from "../components/Icon";
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  getComandas,
  getComandaSummary,
  updateComanda,
  getPrintComanda,
  mergeComandas,
  changeComandaNumber,
  lancarCouvert,
  paySelection,
  clearComanda,
  openComanda,
  updatePedido,
  deletePedido,
} from "../api";
import { useSocket } from "../socket";
import {
  buildComandaPrintHtml,
  openComandaPrintWindow,
} from "../utils/comandaImpressao";
import { textoResumoAddonsPedido } from "../utils/lancheAddons";
import CaixaQuickAdd from "../components/CaixaQuickAdd";
import CashPayment from "../components/CashPayment";
import CashShift from "../components/CashShift";
import ItemActionsMenu from "../components/ItemActionsMenu";
import {
  startCaixaOnlineOrderAlarm,
  stopCaixaOnlineOrderAlarm,
} from "../utils/caixaOnlineOrderAlarm";

const cash = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const OPEN_STATUSES = ["open", "ordering", "paying"];

function statusLabel(st) {
  const s = String(st || "").toLowerCase();
  if (s === "paying") return "Pagamento";
  if (s === "ordering") return "Pedindo";
  if (s === "open") return "Aberta";
  return s;
}

export default function Caixa() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [onlyPaying,setOnlyPaying]=useState(false);
  useEffect(()=>{const key=e=>{if(e.key==='F2'){e.preventDefault();document.querySelector('input[aria-label="Buscar mesa ou comanda"]')?.focus();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  const accountRequest = useRef(0);
  const [comandas, setComandas] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [paymentOpen,setPaymentOpen]=useState(false),[shiftOpen,setShiftOpen]=useState(false),[feedback,setFeedback]=useState('');
  const overlayOpen=Boolean(summary||modal||shiftOpen);
  useEffect(()=>{
    if(!summary || modal || paymentOpen)return;
    const previous=document.activeElement;
    const dialog=document.querySelector('.account-modal');
    const focusable=()=>[...dialog.querySelectorAll('button,input,select,textarea,summary,a[href]')].filter(e=>!e.disabled&&e.getClientRects().length);
    focusable()[0]?.focus();
    const key=e=>{
      if(e.key==='Escape'){e.preventDefault();setSummary(null);}
      if(e.key==='Tab') { const all=focusable(),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();} }
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[summary?.comanda.id,modal,paymentOpen]);
  useEffect(()=>{if(!overlayOpen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous}},[overlayOpen]);
  const [agruparDestino, setAgruparDestino] = useState(null);
  const [agruparOrigens, setAgruparOrigens] = useState([]);
  const [novoNumero, setNovoNumero] = useState("");
  const [novaMesa, setNovaMesa] = useState("");
  const [mesaAbrir, setMesaAbrir] = useState("");
  const [caixaError, setCaixaError] = useState("");
  const [cobrancaSeparadaIds, setCobrancaSeparadaIds] = useState([]);
  const [cobrancaSeparadaLoading, setCobrancaSeparadaLoading] = useState(false);
  const [clearComandaLoading, setClearComandaLoading] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [exibicaoCompleta, setExibicaoCompleta] = useState(true);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [editGroupModal, setEditGroupModal] = useState(null);
  const [obsDraft, setObsDraft] = useState("");
  const cpfInputRef = useRef(null);
  useEffect(() => {
    setObsDraft(summary?.comanda?.observation || "");
    setQuickAddOpen(false);
    setItemSearch("");
  }, [summary?.comanda?.id]);
  const loadTimeoutRef = useRef(null);
  /** Fila de avisos de pedido online (socket `novo-pedido-online`). */
  const [onlineOrderQueue, setOnlineOrderQueue] = useState([]);
  const savedTitleRef = useRef(
    typeof document !== "undefined" ? document.title : "",
  );

  const load = async () => {
    try {
      const data = await getComandas();
      setComandas(data);
    } catch (e) {
      setCaixaError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const scheduleLoad = () => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = setTimeout(() => {
      void load();
      loadTimeoutRef.current = null;
    }, 280);
  };

  useEffect(() => {
    void load();
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, []);

  useSocket((payload, eventName) => {
    scheduleLoad();
    if (summary?.comanda?.id) void refreshSummary();
    if (
      eventName === "novo-pedido-online" &&
      payload &&
      (payload.orderId != null || payload.comandaId != null)
    ) {
      setOnlineOrderQueue((q) => {
        const oid = Number(payload.orderId);
        if (Number.isFinite(oid) && q.some((x) => Number(x.orderId) === oid))
          return q;
        return [...q, { ...payload, _id: `${payload.orderId}-${Date.now()}` }];
      });
    }
  });

  const onlineOrderAlert = onlineOrderQueue[0] || null;

  useEffect(() => {
    if (!onlineOrderAlert) {
      stopCaixaOnlineOrderAlarm();
      if (typeof document !== "undefined" && savedTitleRef.current) {
        document.title = savedTitleRef.current;
      }
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate)
        navigator.vibrate([280, 120, 280]);
    } catch {
      /* Recurso opcional de áudio/vibração indisponível. */
    }
    startCaixaOnlineOrderAlarm();
    let flip = false;
    const titleIv = window.setInterval(() => {
      flip = !flip;
      if (typeof document !== "undefined") {
        document.title = flip
          ? " NOVO PEDIDO ONLINE — Caixa"
          : savedTitleRef.current || "Caixa";
      }
    }, 950);
    return () => {
      window.clearInterval(titleIv);
      stopCaixaOnlineOrderAlarm();
      if (typeof document !== "undefined" && savedTitleRef.current) {
        document.title = savedTitleRef.current;
      }
    };
  }, [onlineOrderAlert?._id]);

  const dismissOnlineOrderAlert = (accepted) => {
    stopCaixaOnlineOrderAlarm();
    setOnlineOrderQueue((q) => q.slice(1));
    if (accepted) navigate("/pedidos-online");
  };

  const emAndamentoIds = useMemo(() => {
    const ids = [];
    for (let i = 1; i <= 200; i++) {
      const c = comandas[i];
      const st = String(c?.status || "").toLowerCase();
      if (c?.mesa && OPEN_STATUSES.includes(st)) ids.push(i);
    }
    return ids.sort((a,b)=>Number(comandas[b].status==='paying')-Number(comandas[a].status==='paying')||String(comandas[a].created_at).localeCompare(String(comandas[b].created_at)));
  }, [comandas]);

  const livresIds = useMemo(() => {
    const set = new Set(emAndamentoIds);
    const out = [];
    for (let i = 1; i <= 200; i++) if (!set.has(i)) out.push(i);
    return out;
  }, [emAndamentoIds]);

  const comandasAbertas = useMemo(
    () => emAndamentoIds.map((id) => [String(id), comandas[id]]),
    [emAndamentoIds, comandas],
  );

  const openSummary = async (id) => {
    const request = ++accountRequest.current;
    try {
      const data = await getComandaSummary(Number(id));
      if (request === accountRequest.current) setSummary(data);
    } catch (e) {
      setCaixaError(e.message);
    }
  };

  const refreshSummary = async () => {
    if (!summary?.comanda?.id) return;
    const id = summary.comanda.id;
    try {
      const data = await getComandaSummary(id);
      setSummary((current) => (current?.comanda.id === id ? data : current));
    } catch (e) {
      setCaixaError(e.message);
    }
  };

  const toggleServiceTax = async () => {
    if (!summary) return;
    const next = summary.comanda.service_tax_percent ? 0 : 10;
    await updateComanda(summary.comanda.id, { service_tax_percent: next });
    await refreshSummary();
  };

  const setPeople = async (n) => {
    if (!summary) return;
    const v = Math.max(0, Number(n) || 0);
    await updateComanda(summary.comanda.id, { people_count: v });
    await refreshSummary();
  };

  const registrarPago = () => setPaymentOpen(true);

  const setCPF = async (cpf) => {
    if (!summary) return;
    await updateComanda(summary.comanda.id, { client_cpf: cpf });
    await refreshSummary();
  };

  const handleLancarCouvert = async () => {
    if (!summary) return;
    setCaixaError("");
    try {
      await lancarCouvert(summary.comanda.id);
      await refreshSummary();
    } catch (e) {
      setCaixaError(e.message || "Erro ao lançar couvert");
    }
  };

  const saveObservation = async () => {
    if (!summary) return;
    if (obsDraft === (summary.comanda.observation || "")) return;
    try {
      await updateComanda(summary.comanda.id, { observation: obsDraft });
      await refreshSummary();
    } catch (e) {
      setCaixaError(e.message || "Erro ao salvar observação");
    }
  };

  const toggleLocked = async () => {
    if (!summary) return;
    try {
      await updateComanda(summary.comanda.id, { locked: summary.comanda.locked ? 0 : 1 });
      await refreshSummary();
    } catch (e) {
      setCaixaError(e.message || "Erro ao bloquear pedido");
    }
  };

  const incrementGroup = async (g) => {
    const row = g.rows[0];
    try {
      await updatePedido(row.id, { quantity: row.quantity + 1 });
      await refreshSummary();
    } catch (e) {
      setCaixaError(e.message || "Erro ao alterar item");
    }
  };

  const decrementGroup = async (g) => {
    const row = g.rows[g.rows.length - 1];
    try {
      if (row.quantity > 1) await updatePedido(row.id, { quantity: row.quantity - 1 });
      else await deletePedido(row.id);
      await refreshSummary();
    } catch (e) {
      setCaixaError(e.message || "Erro ao alterar item");
    }
  };

  const deleteGroup = async (g) => {
    if (!window.confirm(`Excluir ${g.item_name} do pedido?`)) return;
    try {
      await Promise.all(g.rows.map((r) => deletePedido(r.id)));
      await refreshSummary();
    } catch (e) {
      setCaixaError(e.message || "Erro ao excluir item");
    }
  };

  const openEditGroup = (g) => {
    if (g.rows.length !== 1) return;
    setEditGroupModal({
      id: g.rows[0].id,
      quantity: g.rows[0].quantity,
      observations: g.rows[0].observations || "",
    });
  };

  const saveEditGroup = async () => {
    if (!editGroupModal) return;
    try {
      await updatePedido(editGroupModal.id, {
        quantity: Math.max(1, parseInt(editGroupModal.quantity, 10) || 1),
        observations: editGroupModal.observations.trim() || null,
      });
      setEditGroupModal(null);
      await refreshSummary();
    } catch (e) {
      setCaixaError(e.message || "Erro ao editar item");
    }
  };

  function formatIniciado(dt) {
    if (!dt) return "";
    const [datePart, timePart] = String(dt).split(" ");
    if (!datePart) return dt;
    const [, m, d] = datePart.split("-");
    return `${d}-${m} às ${(timePart || "").slice(0, 5)}`;
  }

  const toggleCobrancaPedido = (id) => {
    setCobrancaSeparadaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const pagarSelecao = async () => {
    if (cobrancaSeparadaIds.length === 0) {
      setCaixaError("Selecione ao menos um item para cobrança separada.");
      return;
    }
    setCaixaError("");
    setCobrancaSeparadaLoading(true);
    try {
      await paySelection(summary.comanda.id, cobrancaSeparadaIds);
      await refreshSummary();
      setModal(null);
      setCobrancaSeparadaIds([]);
    } catch (e) {
      setCaixaError(e.message || "Erro ao registrar pagamento");
    } finally {
      setCobrancaSeparadaLoading(false);
    }
  };

  const groupedPedidos = summary?.pedidos?.length
    ? (() => {
        const m = {};
        summary.pedidos.forEach((p) => {
          const k = `${p.item_id}|${p.unit_price}|${p.meat_point || ""}|${p.observations || ""}|${p.extra_caramelized_onion || 0}|${p.extra_hamburger || 0}`;
          if (!m[k]) {
            m[k] = {
              item_name: p.item_name,
              unit_price: p.unit_price,
              quantity: 0,
              lineTotal: 0,
              observations: p.observations || "",
              extra_caramelized_onion: p.extra_caramelized_onion,
              extra_hamburger: p.extra_hamburger,
              rows: [],
            };
          }
          m[k].quantity += p.quantity;
          m[k].lineTotal += p.quantity * p.unit_price;
          m[k].rows.push(p);
        });
        return Object.values(m);
      })()
    : [];

  const visiblePedidos = itemSearch.trim()
    ? groupedPedidos.filter((g) =>
        g.item_name.toLowerCase().includes(itemSearch.trim().toLowerCase()),
      )
    : groupedPedidos;

  const toggleAgruparOrigem = (id) => {
    const n = Number(id);
    setAgruparOrigens((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
    );
  };

  const confirmarAgrupar = async () => {
    if (!agruparDestino || agruparOrigens.length === 0) {
      setCaixaError(
        "Selecione a comanda destino e ao menos uma comanda para agrupar.",
      );
      return;
    }
    setCaixaError("");
    try {
      await mergeComandas(agruparDestino, agruparOrigens);
      setSummary(null);
      setModal(null);
      setAgruparDestino(null);
      setAgruparOrigens([]);
      await load();
    } catch (e) {
      setCaixaError(e.message || "Erro ao agrupar");
    }
  };

  const confirmarTrocarNumero = async () => {
    const n = parseInt(novoNumero, 10);
    if (!summary || Number.isNaN(n) || n < 1 || n > 200) {
      setCaixaError("Informe um número de comanda entre 1 e 200.");
      return;
    }
    if (n === summary.comanda.id) {
      setCaixaError("O número novo deve ser diferente do atual.");
      return;
    }
    setCaixaError("");
    try {
      await changeComandaNumber(summary.comanda.id, n);
      setModal(null);
      setNovoNumero("");
      setSummary(null);
      await load();
      const data = await getComandaSummary(n);
      setSummary(data);
    } catch (e) {
      setCaixaError(e.message || "Erro ao trocar número");
    }
  };

  const salvarMesa = async () => {
    if (!summary) return;
    const v = String(novaMesa).trim();
    if (!v) return;
    setCaixaError("");
    try {
      await updateComanda(summary.comanda.id, { mesa: v });
      await refreshSummary();
      setModal(null);
      setNovaMesa("");
    } catch (e) {
      setCaixaError(e.message || "Erro ao alterar mesa");
    }
  };

  const excluirComandaInteira = async () => {
    if (!summary) return;
    if (
      !window.confirm(
        `Excluir a comanda ${summary.comanda.id} por completo? Todos os pedidos serão cancelados (cozinha/bar) e a mesa será liberada. Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setCaixaError("");
    setClearComandaLoading(true);
    try {
      await clearComanda(summary.comanda.id);
      setSummary(null);
      await load();
    } catch (e) {
      setCaixaError(e.message || "Erro ao excluir comanda");
    } finally {
      setClearComandaLoading(false);
    }
  };

  const printComanda = () => {
    if (!summary) return;
    getPrintComanda(summary.comanda.id).then((d) => {
      openComandaPrintWindow(buildComandaPrintHtml(d), `Comanda ${d.comanda}`);
    });
  };

  const abrirComandaLivre = async () => {
    const id = modal?.id;
    const mesa = String(mesaAbrir || "").trim();
    if (!id || !mesa) {
      setCaixaError("Informe o número da mesa.");
      return;
    }
    setCaixaError("");
    try {
      await openComanda(id, mesa, null);
      setModal(null);
      setMesaAbrir("");
      await load();
      await openSummary(id);
      setSearch('');
    } catch (e) {
      setCaixaError(e.message || "Erro ao abrir comanda");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[#b5bfcf]">
        Carregando caixa…
      </div>
    );
  }

  return (
    <div className="register-page">
      {paymentOpen&&summary&&<CashPayment summary={summary} onClose={()=>setPaymentOpen(false)} onPaid={result=>{setPaymentOpen(false);setFeedback(`Recebimento registrado.${result.change?' Troco: '+cash(result.change):''}`);if(result.closed)setSummary(null);else if(result.summary)setSummary(result.summary);else void refreshSummary();void load();}}/>}
      {shiftOpen&&<CashShift onClose={()=>setShiftOpen(false)}/>}
      {onlineOrderAlert && (
        <>
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 pt-16 pb-16 backdrop-blur-[2px] sm:p-8 sm:pt-20 sm:pb-20"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="caixa-novo-pedido-titulo"
          >
            <div className="cash-alert pointer-events-auto w-full max-w-lg rounded-2xl border-4 border-[#d11d1d] bg-[#212226] p-6 shadow-2xl ring-4 ring-[#f7b200]/90 sm:p-8">
              <p className="text-center text-xs font-black uppercase tracking-[0.25em] text-[#d11d1d]">
                Pedido online recebido
              </p>
              <h2
                id="caixa-novo-pedido-titulo"
                className="mt-2 text-center text-3xl font-black text-[#ccd2e1] sm:text-4xl"
              >
                #{onlineOrderAlert.orderId ?? "—"}
              </h2>
              <p className="mt-3 text-center text-base text-[#bbc6d6]">
                <span className="font-semibold">
                  {onlineOrderAlert.cliente_nome || "Cliente"}
                </span>
                {onlineOrderAlert.cliente_telefone ? (
                  <span className="mt-1 block text-sm text-[#b5bfcf]">
                    Tel. {onlineOrderAlert.cliente_telefone}
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-center text-xl font-bold text-[#d45f05]">
                {typeof onlineOrderAlert.valor_total === "number"
                  ? `Total R$ ${Number(onlineOrderAlert.valor_total).toFixed(2).replace(".", ",")}`
                  : ""}
              </p>
              <p className="mt-2 text-center text-sm text-[#8f9db2]">
                {String(onlineOrderAlert.tipo || "").toLowerCase() ===
                "delivery"
                  ? "Delivery"
                  : "Retirada no balcão"}
                {onlineOrderAlert.comandaId != null
                  ? ` · Comanda #${onlineOrderAlert.comandaId}`
                  : ""}
              </p>
              <p className="mt-4 rounded-lg border border-[#ffd117] bg-[#312e22] px-3 py-2 text-center text-xs font-semibold text-[#c84804]">
                Um novo pedido chegou. Abra a central para conferir os detalhes.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  className="rounded-xl bg-[#02cd8e] px-6 py-3.5 text-base font-black text-white shadow-lg hover:bg-[#0dd08f]"
                  onClick={() => dismissOnlineOrderAlert(true)}
                >
                  Ver pedido
                </button>
                <button
                  type="button"
                  className="rounded-xl border-2 border-[#414c5a] bg-[#212226] px-6 py-3.5 text-base font-black text-[#c5cedc] hover:bg-[#242a30]"
                  onClick={() => dismissOnlineOrderAlert(false)}
                >
                  Continuar no caixa
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <header className="register-heading">
        <div>
          <h1>Frente de caixa</h1>
          <span>Atendimento e recebimento</span>
        </div>
        <div className="register-heading-actions"><button className="btn btn-secondary" onClick={()=>setShiftOpen(true)}>Turno do caixa</button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setModal("agrupar");
              setAgruparDestino(null);
              setAgruparOrigens([]);
              setCaixaError("");
            }}
            disabled={comandasAbertas.length < 2}
          >
            <Icon name="receipt" size={16} />
            Juntar comandas
          </button>
          <button
            className="icon-button"
            aria-label="Atualizar comandas"
            onClick={() => void load()}
          >
            <Icon name="refresh" size={18} />
          </button>
        </div>
      </header>
      {feedback&&<p className="operation-feedback" role="status">{feedback}</p>}
      {search && !emAndamentoIds.some(id=>String(id).includes(search)||String(comandas[id]?.mesa||" ").includes(search)) && !livresIds.some(id=>String(id).includes(search)) && <p className="empty-panel">Nenhuma comanda encontrada. <button className="text-action" onClick={()=>setSearch("")}>Limpar busca</button></p>}
      <div className="cash-grid-toolbar"><label className="register-search"><Icon name="search" size={17}/><input placeholder="Buscar mesa ou comanda · F2" aria-label="Buscar mesa ou comanda" value={search} onChange={e=>setSearch(e.target.value)}/></label><label><input type="checkbox" checked={onlyPaying} onChange={e=>setOnlyPaying(e.target.checked)}/> Aguardando pagamento</label><div className="cash-grid-legend"><span><i className="just-opened"/>Aberta</span><span><i className="occupied"/>Pedindo</span><span><i className="awaiting"/>Pagamento</span><span><i className="available"/>Livre</span></div></div>
      <section className="cash-grid-section" aria-labelledby="cash-open-title"><header><h2 id="cash-open-title">Comandas abertas <span>{emAndamentoIds.length}</span></h2></header><div className="cash-comandas-grid">{emAndamentoIds.filter(id=>!onlyPaying||comandas[id]?.status==="paying").filter(id=>!search||String(id).includes(search)||String(comandas[id]?.mesa||'').includes(search)).map(id=>{const c=comandas[id];return <button key={id} className={'cash-comanda occupied '+(c.status==='paying'?'awaiting':c.status==='open'?'just-opened':'')} onClick={()=>void openSummary(id)} aria-label={'Abrir conta da comanda '+id}><span className="cash-comanda-status">{statusLabel(c.status)}</span><strong className="cash-comanda-number">{String(id).padStart(2,'0')}</strong><span className="cash-comanda-bottom"><span>Mesa {c.mesa}</span><b>{cash(c.saldo??c.total_pedidos)}</b></span></button>})}</div>{!emAndamentoIds.length&&<p className="cash-grid-empty">Nenhuma comanda aberta. Escolha uma livre abaixo para iniciar.</p>}</section>
      <section className="cash-grid-section cash-free-grid-section" aria-labelledby="cash-free-title"><header><h2 id="cash-free-title">Comandas livres <span>{livresIds.length}</span></h2></header><div className="cash-comandas-grid free-grid">{livresIds.filter(id=>!search||String(id).includes(search)).map(id=><button key={id} className="cash-comanda available" aria-label={'Abrir comanda livre '+id} onClick={()=>{setModal({type:'abrir',id});setMesaAbrir('');setCaixaError('')}}><strong className="cash-comanda-number">{String(id).padStart(2,'0')}</strong><span>Livre <Icon name="plus" size={13}/></span></button>)}</div></section>
      {summary&&<div className="account-modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setSummary(null)}}><section className="register-account-workspace account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
              <button
                className="account-modal-close icon-button"
                aria-label="Fechar conta"
                onClick={() => setSummary(null)}
              >
                <Icon name="close" size={20} />
              </button>
              <header className="account-modal-topbar">
                <div className="account-modal-title">
                  <span className="register-receipt-number">
                    {String(summary.comanda.id).padStart(2, "0")}
                  </span>
                  <span
                    className={`account-status-pill ${summary.comanda.status === "paying" ? "paying" : ""}`}
                  >
                    {statusLabel(summary.comanda.status)}
                  </span>
                  <h2 id="account-modal-title">Pedido #{summary.comanda.id}</h2>
                </div>
                <div className="account-modal-toolbar">
                  <label className="account-modal-search">
                    <Icon name="search" size={16} />
                    <input
                      placeholder="Buscar Produto…"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={summary.comanda.status === "closed" || !!summary.comanda.locked}
                    onClick={() => setQuickAddOpen(true)}
                  >
                    <Icon name="plus" size={16} />
                    Produtos
                  </button>
                </div>
              </header>
              <div className="account-modal-columns">
              <aside className="account-modal-sidebar">
              <div className="account-modal-meta">
                <p>
                  <Icon name="clock" size={14} />
                  Iniciado em {formatIniciado(summary.comanda.created_at)}
                </p>
                <textarea
                  className="account-modal-observation"
                  placeholder="Anotar observação…"
                  value={obsDraft}
                  onChange={(e) => setObsDraft(e.target.value)}
                  onBlur={() => void saveObservation()}
                />
                <label className="account-modal-lock">
                  <span>Bloquear Pedido</span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={!!summary.comanda.locked}
                      onChange={() => void toggleLocked()}
                    />
                    <span className="switch-track" />
                  </span>
                </label>
              </div>
              <div className="register-adjustments">
                <div className="register-adjustments-heading">
                  <Icon name="receipt" size={16} />
                  Serviço, couvert e CPF
                </div>
                <div className="register-adjustment-fields">
                  <label className="register-service">
                    <input
                      type="checkbox"
                      checked={!!summary.comanda.service_tax_percent}
                      onChange={() => void toggleServiceTax()}
                    />
                    <span>
                      Serviço de 10%<small>Não incide sobre couvert</small>
                    </span>
                  </label>
                  <div className="register-couvert">
                    <label>
                      Pessoas para couvert
                      <input
                        aria-label="Pessoas para couvert"
                        type="number"
                        min="0"
                        value={summary.comanda.people_count || 0}
                        onChange={(e) => void setPeople(e.target.value)}
                      />
                    </label>
                    <button
                      className="btn btn-secondary"
                      disabled={!(summary.comanda.people_count > 0)}
                      onClick={() => void handleLancarCouvert()}
                    >
                      Lançar couvert
                    </button>
                    <small>Cobrado somente após lançar.</small>
                  </div>
                  <label className="register-cpf">
                    CPF do cliente
                    <input
                      ref={cpfInputRef}
                      placeholder="Opcional"
                      value={summary.comanda.client_cpf || ""}
                      onChange={(e) => void setCPF(e.target.value)}
                    />
                  </label>
                </div>
              </div>
              <div className="account-modal-sidebar-bottom">
                <details className="register-options">
                  <summary>
                    Mais Opções <span>⌄</span>
                  </summary>
                  <div>
                    <button onClick={()=>{setModal("agrupar");setAgruparDestino(summary.comanda.id);setAgruparOrigens([]);setCaixaError("")}} disabled={comandasAbertas.length<2}>Juntar comandas</button>
                    <button
                      onClick={() => {
                        setModal({
                          type: "trocarMesa",
                          id: summary.comanda.id,
                        });
                        setNovaMesa(summary.comanda.mesa || "");
                        setCaixaError("");
                      }}
                    >
                      Trocar mesa
                    </button>
                    <button
                      onClick={() => {
                        setModal({
                          type: "trocarNumero",
                          id: summary.comanda.id,
                        });
                        setNovoNumero("");
                        setCaixaError("");
                      }}
                    >
                      Trocar número
                    </button>
                    <button onClick={() => void refreshSummary()}>
                      Atualizar totais
                    </button>
                    <button
                      className="register-danger"
                      onClick={() => void excluirComandaInteira()}
                      disabled={clearComandaLoading}
                    >
                      {clearComandaLoading
                        ? "Excluindo…"
                        : "Excluir comanda inteira"}
                    </button>
                  </div>
                </details>
                <button
                  type="button"
                  className="sidebar-link"
                  onClick={() => setSummary(null)}
                >
                  <Icon name="arrow" size={16} style={{ transform: "rotate(180deg)" }} />
                  Voltar
                </button>
              </div>
              </aside>
              <div className="account-modal-main">
              <div className="account-scroll-body">
              <div className="register-receipt-tools">
                <strong>
                  Itens do Pedido{" "}
                  <span>
                    ({summary.pedidos.reduce((n, p) => n + p.quantity, 0)})
                  </span>
                </strong>
                <label className="account-modal-full-toggle">
                  <input
                    type="checkbox"
                    checked={exibicaoCompleta}
                    onChange={(e) => setExibicaoCompleta(e.target.checked)}
                  />
                  Exibição Completa
                </label>
              </div>
              <div className="register-consumption">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th className="numeric">Qtd.</th>
                      <th className="numeric">Unitário</th>
                      <th className="numeric">Valor</th>
                      <th className="register-consumption-actions-head" />
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePedidos.map((g, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{g.item_name}</strong>
                          {exibicaoCompleta && textoResumoAddonsPedido(g) && (
                            <small>{textoResumoAddonsPedido(g)}</small>
                          )}
                          {exibicaoCompleta && g.observations && <small>{g.observations}</small>}
                          {(() => {
                            const quem = [...new Set((g.rows || []).map((r) => r.launched_by).filter(Boolean))];
                            return quem.length ? <small>Lançado por {quem.join(", ")}</small> : null;
                          })()}
                        </td>
                        <td className="numeric">{g.quantity}</td>
                        <td className="numeric">{cash(g.unit_price)}</td>
                        <td className="numeric">
                          <strong>{cash(g.lineTotal)}</strong>
                        </td>
                        <td className="register-consumption-actions">
                          <ItemActionsMenu
                            label={`Mais ações de ${g.item_name}`}
                            actions={[
                              { label: "Aumentar +1", onClick: () => incrementGroup(g), disabled: !!summary.comanda.locked },
                              { label: "Diminuir -1", onClick: () => decrementGroup(g), disabled: !!summary.comanda.locked },
                              { label: "Editar", onClick: () => openEditGroup(g), disabled: g.rows.length !== 1 || !!summary.comanda.locked },
                              { label: "Excluir", danger: true, onClick: () => deleteGroup(g), disabled: !!summary.comanda.locked },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visiblePedidos.length && (
                  <p className="register-list-empty">
                    {groupedPedidos.length
                      ? "Nenhum produto encontrado."
                      : "Nenhum produto lançado nesta comanda."}
                  </p>
                )}
              </div>
              </div>
              <footer className="register-settlement">
                <div className="register-breakdown">
                  <span>Subtotal <strong>{cash(summary.subtotal)}</strong></span>
                  <span>
                    (+) Serviço <strong>{cash(summary.serviceTax)}</strong>
                  </span>
                  {summary.couvert > 0 && (
                    <span>Couvert <strong>{cash(summary.couvert)}</strong></span>
                  )}
                  {summary.paidTotal > 0 && (
                    <span>
                      Já recebido <strong>{cash(summary.paidTotal)}</strong>
                    </span>
                  )}
                </div>
                <div className="register-pay-row">
                  <button type="button" className="register-print-link" onClick={printComanda}>
                    <Icon name="print" size={18} />
                    Imprimir
                  </button>
                  <div className="register-pay-row-right">
                    <div className="register-pay-total">
                      <span>Total</span>
                      <strong>{cash(summary.total)}</strong>
                    </div>
                    <button
                      className="btn register-pay-button"
                      onClick={registrarPago}
                      disabled={summary.comanda.status === "closed"}
                    >
                      <Icon name="check" size={20} />
                      Pagamento
                    </button>
                  </div>
                </div>
              </footer>
              </div>
              </div>

        {caixaError&&<p className="error-banner" role="alert">{caixaError}</p>}
      </section>
      <CaixaQuickAdd
        open={quickAddOpen}
        comandaId={summary.comanda.id}
        comandaStatus={summary.comanda.status}
        onClose={() => setQuickAddOpen(false)}
        onItemAdded={refreshSummary}
      /></div>}

      {caixaError && <p className="text-sm text-[#d11d1d]">{caixaError}</p>}

      {modal === "agrupar" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-[2px]">
          <div className="my-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#2b3036] bg-[#212226] shadow-2xl">
            <div className="border-b border-[#242a30] bg-[#21272c] px-6 py-4">
              <h3 className="text-lg font-bold text-[#ccd2e1]">
                Juntar comandas
              </h3>
              <p className="mt-1 text-sm text-[#b5bfcf]">
                Selecione a comanda destino e as comandas de origem. Todos os
                pedidos vão para o destino; as origens são fechadas.
              </p>
            </div>
            <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-3">
              <div className="border-b border-[#242a30] p-5 md:border-b-0 md:border-r">
                <p className="mb-2 text-xs font-bold uppercase text-[#8f9db2]">
                  Destino
                </p>
                <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                  {comandasAbertas.map(([id, c]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAgruparDestino(Number(id))}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                        agruparDestino === Number(id)
                          ? "bg-[#ea9404] text-[#0d0e10]"
                          : "bg-[#242a30] text-[#c5cedc] hover:bg-[#2b3036]"
                      }`}
                    >
                      {id} · Mesa {c.mesa}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-b border-[#242a30] p-5 md:border-b-0 md:border-r">
                <p className="mb-2 text-xs font-bold uppercase text-[#8f9db2]">
                  Origens (unir ao destino)
                </p>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {comandasAbertas
                    .filter(([id]) => Number(id) !== agruparDestino)
                    .map(([id, c]) => (
                      <label
                        key={id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#242a30] px-3 py-2 hover:bg-[#21272c]"
                      >
                        <input
                          type="checkbox"
                          checked={agruparOrigens.includes(Number(id))}
                          onChange={() => toggleAgruparOrigem(id)}
                        />
                        <span className="text-sm text-[#c5cedc]">
                          Comanda {id} — Mesa {c.mesa}
                        </span>
                      </label>
                    ))}
                </div>
              </div>
              <div className="flex flex-col justify-between bg-[#21272c]/50 p-5">
                <div>
                  <p className="text-xs text-[#8f9db2]">
                    Destino: comanda {agruparDestino ?? "—"}
                  </p>
                  <p className="mt-3 text-sm font-semibold">Saldo após juntar: {cash([agruparDestino,...agruparOrigens].filter(Boolean).reduce((total,id)=>total+Number(comandas[id]?.saldo||0),0))}</p>
                  <p className="mt-2 text-xs text-[#8f9db2]">Os recebimentos e as taxas de cada origem serão preservados.</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary flex-1"
                    onClick={() => {
                      setModal(null);
                      setCaixaError("");
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary flex-1 font-semibold"
                    onClick={() => void confirmarAgrupar()}
                  >
                    Juntar pedidos
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "abrir" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#2b3036] bg-[#212226] p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#ccd2e1]">
              Abrir comanda {modal.id}
            </h3>
            <p className="mt-1 text-sm text-[#8f9db2]">
              Informe o número da mesa para iniciar o atendimento.
            </p>
            <input
              type="text"
              placeholder="Número da mesa"
              value={mesaAbrir}
              onChange={(e) => setMesaAbrir(e.target.value)}
              className="mt-4 w-full rounded-xl border border-[#2b3036] px-4 py-3 text-[#c5cedc]"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && void abrirComandaLivre()}
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => {
                  setModal(null);
                  setCaixaError("");
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1 font-semibold"
                onClick={() => void abrirComandaLivre()}
              >
                Abrir
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "trocarNumero" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#2b3036] bg-[#212226] p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-bold text-[#c5cedc]">
              Trocar número da comanda
            </h3>
            <input
              type="number"
              min="1"
              max="200"
              placeholder="Novo número"
              value={novoNumero}
              onChange={(e) => setNovoNumero(e.target.value)}
              className="mb-4 w-full rounded-lg border border-[#2d353e] bg-[#21272c] px-4 py-2 text-[#c5cedc]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => {
                  setModal(null);
                  setCaixaError("");
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => void confirmarTrocarNumero()}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "trocarMesa" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#2b3036] bg-[#212226] p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-bold text-[#c5cedc]">
              Trocar mesa
            </h3>
            <input
              type="text"
              placeholder="Número da mesa"
              value={novaMesa}
              onChange={(e) => setNovaMesa(e.target.value)}
              className="mb-4 w-full rounded-lg border border-[#2d353e] bg-[#21272c] px-4 py-2 text-[#c5cedc]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => {
                  setModal(null);
                  setCaixaError("");
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => void salvarMesa()}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {editGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#2b3036] bg-[#212226] p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-bold text-[#c5cedc]">Editar item</h3>
            <label className="mb-1 block text-sm font-medium text-[#c7ccd1]">Quantidade</label>
            <input
              type="number"
              min="1"
              value={editGroupModal.quantity}
              onChange={(e) => setEditGroupModal((prev) => ({ ...prev, quantity: e.target.value }))}
              className="mb-3 w-full rounded-lg border border-[#2d353e] bg-[#21272c] px-4 py-2 text-[#c5cedc]"
            />
            <label className="mb-1 block text-sm font-medium text-[#c7ccd1]">Descrição</label>
            <textarea
              rows={3}
              value={editGroupModal.observations}
              onChange={(e) => setEditGroupModal((prev) => ({ ...prev, observations: e.target.value }))}
              placeholder="Ex.: sem gelo, ponto da carne, etc."
              className="mb-4 w-full rounded-lg border border-[#2d353e] bg-[#21272c] px-3 py-2 text-sm text-[#c5cedc]"
            />
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary flex-1" onClick={() => setEditGroupModal(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary flex-1" onClick={() => void saveEditGroup()}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "cobrancaSeparada" && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#2b3036] bg-[#212226] shadow-xl">
            <div className="border-b border-[#2b3036] p-5">
              <h3 className="text-lg font-bold text-[#c5cedc]">
                Cobrança separada
              </h3>
              <p className="mt-1 text-sm text-[#8f9db2]">
                Os itens serão registrados como pagos. O saldo restante continua
                na comanda.
              </p>
            </div>
            <ul className="flex-1 space-y-2 overflow-y-auto p-5 text-[#bbc6d6]">
              {summary.pedidos.map((p) => {
                const ad = textoResumoAddonsPedido(p);
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#242a30] px-3 py-2"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={cobrancaSeparadaIds.includes(p.id)}
                        onChange={() => toggleCobrancaPedido(p.id)}
                      />
                      <span className="truncate text-sm">
                        {p.quantity}x {p.item_name}
                        {ad ? (
                          <span className="text-[#02ca91]">{ad}</span>
                        ) : null}
                      </span>
                    </label>
                    <span className="shrink-0 text-sm text-[#b5bfcf]">
                      R${" "}
                      {(p.quantity * p.unit_price).toFixed(2).replace(".", ",")}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-[#2b3036] bg-[#21272c] p-5">
              {caixaError && (
                <p className="mb-2 text-sm text-[#d11d1d]">{caixaError}</p>
              )}
              <p className="mb-3 flex justify-between font-semibold text-[#c5cedc]">
                Total seleção
                <span>
                  {(() => {
                    const rows = summary.pedidos.filter((p) =>
                      cobrancaSeparadaIds.includes(p.id),
                    );
                    const sub = rows.reduce(
                      (s, p) => s + Math.round(p.unit_price * 100) * p.quantity,
                      0,
                    );
                    const base = rows
                      .filter(
                        (p) => p.item_name.trim().toLowerCase() !== "couvert",
                      )
                      .reduce(
                        (s, p) =>
                          s + Math.round(p.unit_price * 100) * p.quantity,
                        0,
                      );
                    return (
                      "R$ " +
                      (
                        (sub +
                          Math.round(
                            (base *
                              (summary.comanda.service_tax_percent || 0)) /
                              100,
                          )) /
                        100
                      )
                        .toFixed(2)
                        .replace(".", ",")
                    );
                  })()}
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => {
                    setModal(null);
                    setCaixaError("");
                  }}
                  disabled={cobrancaSeparadaLoading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-success flex-1 font-semibold"
                  onClick={() => void pagarSelecao()}
                  disabled={
                    cobrancaSeparadaIds.length === 0 || cobrancaSeparadaLoading
                  }
                >
                  {cobrancaSeparadaLoading ? "…" : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



