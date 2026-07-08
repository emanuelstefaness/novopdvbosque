const MP_API = 'https://api.mercadopago.com';

function getAccessToken() {
  const token = process.env.MP_ACCESS_TOKEN && String(process.env.MP_ACCESS_TOKEN).trim();
  if (!token) throw new Error('MP_ACCESS_TOKEN não configurado');
  return token;
}

function mapMpStatus(mpStatus) {
  switch (mpStatus) {
    case 'approved':
      return 'aprovado';
    case 'rejected':
      return 'rejeitado';
    case 'cancelled':
      return 'cancelado';
    case 'pending':
    case 'in_process':
    default:
      return 'pendente';
  }
}

function syntheticPayerEmail(orderId) {
  return `pedido${orderId}@pedidosonline.bosquecarne.work`;
}

/** Cria uma cobrança PIX no Mercado Pago para o pedido. Lança erro se a API falhar. */
export async function createPixPayment({ orderId, valorTotal, nome, email }) {
  const token = getAccessToken();
  const [firstName, ...restName] = String(nome || 'Cliente').trim().split(/\s+/);
  const expiraEm = new Date(Date.now() + 30 * 60 * 1000);
  const body = {
    transaction_amount: Math.round(Number(valorTotal) * 100) / 100,
    description: `Pedido online #${orderId} - Bosque da Carne`,
    payment_method_id: 'pix',
    external_reference: String(orderId),
    date_of_expiration: expiraEm.toISOString(),
    payer: {
      email: email || syntheticPayerEmail(orderId),
      first_name: firstName || 'Cliente',
      last_name: restName.join(' ') || 'Online',
    },
  };

  const res = await fetch(`${MP_API}/v1/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Idempotency-Key': `pix-order-${orderId}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || `Mercado Pago respondeu ${res.status}`;
    throw new Error(msg);
  }
  const txData = data.point_of_interaction?.transaction_data || {};
  return {
    paymentId: String(data.id),
    qrCode: txData.qr_code || null,
    qrCodeBase64: txData.qr_code_base64 || null,
    expiraEm: expiraEm.toISOString(),
  };
}

/** Consulta o status atual de um pagamento PIX no Mercado Pago. */
export async function getPaymentStatus(paymentId) {
  const token = getAccessToken();
  const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || `Mercado Pago respondeu ${res.status}`;
    throw new Error(msg);
  }
  return { status: mapMpStatus(data.status), mpStatus: data.status };
}

/** Cancela um pagamento PIX pendente (usado quando expira o prazo). Falha silenciosamente. */
export async function cancelPayment(paymentId) {
  try {
    const token = getAccessToken();
    await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });
  } catch (e) {
    console.warn('Falha ao cancelar pagamento PIX no Mercado Pago:', e.message);
  }
}
