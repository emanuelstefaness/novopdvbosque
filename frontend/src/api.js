import { getApiBase } from './devApiBase';

const API = getApiBase();
export async function cashOperation(path,body) {
 const r=await apiFetch(`${API}/api/cash/${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível concluir.');return data;
}
export async function apiFetch(url,options={}) {
  let token;try{token=JSON.parse(localStorage.getItem('pdv_bosque_waiter'))?.token}catch{token=undefined}
  const r=await fetch(url,{...options,headers:{...options.headers,...(token?{Authorization:'Bearer '+token}:{})}});
  if(r.status===401)window.dispatchEvent(new Event('pdv-session-expired'));
  return r;
}
export async function loginOperator(role,password) {
 const r=await fetch(API+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,password})});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao entrar');return d;
}

export async function getWaiterByName(name) {
  const r = await apiFetch(`${API}/api/waiters/by-name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: String(name).trim() })
  });
  if (!r.ok) throw new Error('Falha ao identificar garçom');
  return r.json();
}

export async function getComandas() {
  const r = await apiFetch(`${API}/api/comandas`);
  if (!r.ok) throw new Error('Falha ao carregar comandas');
  return r.json();
}

export async function getComanda(id) {
  const r = await apiFetch(`${API}/api/comandas/${id}`);
  if (!r.ok) throw new Error('Comanda não encontrada');
  return r.json();
}

export async function openComanda(id, mesa, waiter_id) {
  let r;
  try {
    r = await apiFetch(`${API}/api/comandas/${id}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesa: String(mesa).trim(), waiter_id })
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Verifique se o backend está rodando (npm start na pasta backend).');
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Falha ao abrir comanda (${r.status})`);
  return body;
}

export async function updateComanda(id, data) {
  const r = await apiFetch(`${API}/api/comandas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || body.message || 'Falha ao atualizar');
  return body;
}

export async function getComandaSummary(id) {
  const r = await apiFetch(`${API}/api/comandas/${id}/summary`);
  if (!r.ok) throw new Error('Falha ao carregar conta');
  return r.json();
}

export async function mergeComandas(targetId, sourceIds) {
  const r = await apiFetch(`${API}/api/comandas/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_id: targetId, source_ids: Array.isArray(sourceIds) ? sourceIds : [sourceIds] })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.message || `Falha ao agrupar comandas (${r.status})`);
  return data;
}

export async function clearComanda(id) {
  const r = await apiFetch(`${API}/api/comandas/${encodeURIComponent(id)}/clear`, { method: 'POST' });
  const text = await r.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!r.ok) throw new Error(r.status === 404 ? 'Rota não encontrada — reinicie o backend (npm start na pasta backend).' : `Erro ${r.status}`);
  }
  if (!r.ok) throw new Error(data.error || 'Falha ao excluir comanda');
  return data;
}

export async function changeComandaNumber(id, newId) {
  const r = await apiFetch(`${API}/api/comandas/${id}/change-number`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_id: newId })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Falha ao trocar número');
  return data;
}

export async function lancarCouvert(comandaId) {
  const r = await apiFetch(`${API}/api/comandas/${comandaId}/lancar-couvert`, { method: 'POST' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Falha ao lançar couvert');
  return data;
}

export async function getCategories() {
  const r = await apiFetch(`${API}/api/menu/categories`);
  if (!r.ok) throw new Error('Falha ao carregar categorias');
  return r.json();
}

export async function getItems(categoryId) {
  const url = categoryId ? `${API}/api/menu/items?category_id=${categoryId}` : `${API}/api/menu/items`;
  const r = await apiFetch(url);
  if (!r.ok) throw new Error('Falha ao carregar itens');
  return r.json();
}

export async function getEspetinhos() {
  const r = await apiFetch(`${API}/api/menu/espetinhos`);
  if (!r.ok) throw new Error('Falha ao carregar espetinhos');
  return r.json();
}

export async function createCategory(data) {
  const r = await apiFetch(`${API}/api/menu/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'Falha ao criar categoria');
  return body;
}

export async function updateCategory(id, data) {
  const r = await apiFetch(`${API}/api/menu/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'Falha ao atualizar categoria');
  return body;
}

export async function deleteCategory(id) {
  const r = await apiFetch(`${API}/api/menu/categories/${id}`, { method: 'DELETE' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'Falha ao excluir categoria');
  return body;
}

export async function createItem(data) {
  const r = await apiFetch(`${API}/api/menu/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'Falha ao criar item');
  return body;
}

export async function updateItem(id, data) {
  const r = await apiFetch(`${API}/api/menu/items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'Falha ao atualizar item');
  return body;
}

export async function deleteItem(id) {
  const r = await apiFetch(`${API}/api/menu/items/${id}`, { method: 'DELETE' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'Falha ao excluir item');
  return body;
}

export async function createPedido(body) {
  let lastError;
  // Pequeno mecanismo de retry para evitar alertas falsos em quedas rápidas de conexão
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const r = await apiFetch(`${API}/api/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Falha ao enviar pedido');
      return data;
    } catch (e) {
      lastError = e;
      const msg = e && typeof e.message === 'string' ? e.message : '';
      const isNetworkError =
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed') ||
        msg.includes('Sem conexão');

      // Para erros de rede, tentamos algumas vezes antes de avisar o garçom
      if (isNetworkError && attempt < 2) {
        // backoff simples: 200ms, 400ms
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        continue;
      }

      if (isNetworkError) {
        throw new Error('Sem conexão com o servidor. Verifique se o backend está rodando e a rede está ok.');
      }

      // Erros de negócio/validação não fazem sentido repetir
      throw e;
    }
  }
  // fallback defensivo, em teoria não chega aqui
  throw lastError || new Error('Falha ao enviar pedido');
}

export async function getPedidosByComanda(comandaId) {
  const r = await apiFetch(`${API}/api/pedidos/by-comanda/${comandaId}`);
  if (!r.ok) throw new Error('Falha ao carregar pedidos');
  return r.json();
}

export async function updatePedido(id, data) {
  const r = await apiFetch(`${API}/api/pedidos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('Falha ao atualizar pedido');
  return r.json();
}

export async function deletePedido(id) {
  const r = await apiFetch(`${API}/api/pedidos/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Falha ao remover pedido');
  return r.json();
}

export async function cancelPedidosMany(ids) {
  const r = await apiFetch(`${API}/api/pedidos/cancel-many`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Falha ao registrar pagamento da seleção');
  return data;
}

export async function setPedidoSectorStatus(pedidoId, sector, status) {
  const r = await apiFetch(`${API}/api/pedidos/${pedidoId}/sector-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sector, status })
  });
  if (!r.ok) throw new Error('Falha ao atualizar status');
  return r.json();
}

/** Marca pronto na Churrasqueira (setor correto conforme item no servidor; acompanhamentos → cozinha). */
export async function markPedidoChurrasqueiraReady(pedidoId, one = false) {
  const r = await apiFetch(`${API}/api/pedidos/churrasqueira-ready/${pedidoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({one})
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Falha ao marcar pronto');
  return data;
}

export async function getPedidosKitchen() {
  const r = await apiFetch(`${API}/api/pedidos/kitchen`);
  if (!r.ok) throw new Error('Falha ao carregar');
  return r.json();
}

export async function fulfillKitchenUnit(id) {
  const r = await apiFetch(`${API}/api/pedidos/${id}/fulfill-one`, {method:'POST'});
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Falha ao dar baixa');
  return data;
}

export async function getPedidosGrill() {
  const r = await apiFetch(`${API}/api/pedidos/grill`);
  if (!r.ok) throw new Error('Falha ao carregar');
  return r.json();
}

export async function getPedidosBar() {
  const r = await apiFetch(`${API}/api/pedidos/bar`);
  if (!r.ok) throw new Error('Falha ao carregar');
  return r.json();
}

export async function getProductionKitchen() {
  const r = await apiFetch(`${API}/api/pedidos/production/kitchen`);
  if (!r.ok) throw new Error('Falha ao carregar');
  return r.json();
}

export async function getProductionGrill() {
  const r = await apiFetch(`${API}/api/pedidos/production/grill`);
  if (!r.ok) throw new Error('Falha ao carregar');
  return r.json();
}

export async function getPrintComanda(id) {
  const r = await apiFetch(`${API}/api/print/comanda/${id}`);
  if (!r.ok) throw new Error('Falha ao carregar');
  return r.json();
}

export async function getOrders(tipo, status) {
  const params = new URLSearchParams();
  if (tipo) params.set('tipo', tipo);
  if (status) params.set('status', status);
  const r = await apiFetch(`${API}/api/orders?${params}`);
  if (!r.ok) throw new Error('Falha ao carregar pedidos');
  return r.json();
}

export async function updateOrderStatus(id, status, motivo_cancelamento) {
  const body = { status };
  if (motivo_cancelamento != null && String(motivo_cancelamento).trim()) {
    body.motivo_cancelamento = String(motivo_cancelamento).trim();
  }
  const r = await apiFetch(`${API}/api/orders/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Falha ao atualizar status');
  return r.json();
}

export async function getPrintOrder(id) {
  const r = await apiFetch(`${API}/api/print/order/${id}`);
  if (!r.ok) throw new Error('Falha ao carregar');
  return r.json();
}

function reportsRangeQuery(from, to) {
  const p = new URLSearchParams();
  p.set('from', from);
  p.set('to', to);
  return p.toString();
}

/** Relatórios: `from` e `to` no formato YYYY-MM-DD (inclusive). */
export async function getReportsVendasComandas(from, to) {
  const r = await apiFetch(`${API}/api/reports/vendas/dia?${reportsRangeQuery(from, to)}`);
  if (!r.ok) throw new Error('Falha');
  return r.json();
}

/** Faturamento agregado por dia de fechamento no intervalo. */
export async function getReportsVendasPorDia(from, to) {
  const r = await apiFetch(`${API}/api/reports/vendas/mes?${reportsRangeQuery(from, to)}`);
  if (!r.ok) throw new Error('Falha');
  return r.json();
}

export async function getReportsItensMaisVendidos(from, to, limit) {
  const p = new URLSearchParams(reportsRangeQuery(from, to));
  if (limit) p.set('limit', String(limit));
  const r = await apiFetch(`${API}/api/reports/itens-mais-vendidos?${p}`);
  if (!r.ok) throw new Error('Falha');
  return r.json();
}

export async function getReportsPorCategoria(from, to) {
  const r = await apiFetch(`${API}/api/reports/por-categoria?${reportsRangeQuery(from, to)}`);
  if (!r.ok) throw new Error('Falha');
  return r.json();
}

export async function getReportsFaturamento(from, to) {
  const r = await apiFetch(`${API}/api/reports/faturamento?${reportsRangeQuery(from, to)}`);
  if (!r.ok) throw new Error('Falha');
  return r.json();
}

export async function getReportsChurrasqueira(from, to) {
  const r = await apiFetch(`${API}/api/reports/churrasqueira?${reportsRangeQuery(from, to)}`);
  if (!r.ok) throw new Error('Falha');
  return r.json();
}

export async function getReportsPorGarcom(from, to) {
  const r = await apiFetch(`${API}/api/reports/por-garcom?${reportsRangeQuery(from, to)}`);
  if (!r.ok) throw new Error('Falha');
  return r.json();
}

export async function getReportsCancelamentos(from, to) {
  const r = await apiFetch(`${API}/api/reports/cancelamentos?${reportsRangeQuery(from, to)}`);
  if (!r.ok) throw new Error('Falha');
  return r.json();
}

export async function getFinanceDaily(from, to) {
  const q = reportsRangeQuery(from, to);
  const r = await apiFetch(`${API}/api/finance/daily?${q}`);
  if (!r.ok) throw new Error('Falha ao carregar financeiro');
  return r.json();
}

export async function getFinanceEntries(from, to) {
  const q = reportsRangeQuery(from, to);
  const r = await apiFetch(`${API}/api/finance/entries?${q}`);
  if (!r.ok) throw new Error('Falha ao carregar lançamentos');
  return r.json();
}

export async function postFinanceExpense(body) {
  const r = await apiFetch(`${API}/api/finance/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Falha ao registrar despesa');
  return data;
}

export async function postFinanceIncomeManual(body) {
  const r = await apiFetch(`${API}/api/finance/income-manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Falha ao registrar entrada');
  return data;
}

export async function deleteFinanceExpense(id) {
  const r = await apiFetch(`${API}/api/finance/expenses/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Falha ao excluir');
  return r.json();
}

export async function deleteFinanceIncomeManual(id) {
  const r = await apiFetch(`${API}/api/finance/income-manual/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Falha ao excluir');
  return r.json();
}

export async function paySelection(id,ids) {
  const r=await apiFetch(`${API}/api/comandas/${id}/pay-selection`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
  const data=await r.json();if(!r.ok)throw new Error(data.error || 'Falha ao registrar pagamento');return data;
}
