import {useState,useRef,useEffect} from 'react';
import {cashOperation} from '../api';
import Icon from './Icon';
const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const cent=n=>Math.round(Number(n)*100);
const methods={dinheiro:'Dinheiro',pix:'PIX',debito:'Débito',credito:'Crédito'};
const methodIcons={dinheiro:'wallet',pix:'bolt',debito:'card',credito:'card'};
export default function CashPayment({summary,onClose,onPaid}){
 const [quantities,setQuantities]=useState(Object.fromEntries(summary.pedidos.map(p=>[p.id,p.quantity])));
 const [tenders,setTenders]=useState([{method:'dinheiro',amount:summary.total.toFixed(2)}]);
 const [people,setPeople]=useState(2),[busy,setBusy]=useState(false),[error,setError]=useState('');const request=useRef(null),lock=useRef(false);
 const [advance,setAdvance]=useState(false),[partial,setPartial]=useState('');
 const selected=summary.pedidos.filter(p=>quantities[p.id]>0).map(p=>({...p,quantity:Number(quantities[p.id])}));
 const groups={};let subtotal=0,couvert=0;
 for(const p of selected){const value=cent(p.unit_price)*p.quantity;subtotal+=value;if(p.item_name.trim().toLowerCase()==='couvert'){couvert+=value;continue;}const key=p.billing_service_group||'current';groups[key]??={base:0,rate:Number(p.billing_service_percent??summary.comanda.service_tax_percent)||0};groups[key].base+=value;}
 const remainingGroups={};
 for(const p of summary.pedidos){if(p.item_name.trim().toLowerCase()==='couvert')continue;const key=p.billing_service_group||'current';remainingGroups[key]??={base:0,rate:Number(p.billing_service_percent??summary.comanda.service_tax_percent)||0};remainingGroups[key].base+=cent(p.unit_price)*(p.quantity-Number(quantities[p.id]||0));}
 const remainingService=Object.values(remainingGroups).reduce((n,g)=>n+Math.round(g.base*g.rate/100),0);
 const service=cent(summary.serviceTax)-remainingService,selectedTotal=(subtotal+service)/100-(summary.credit||0),total=advance?Number(partial||0):selectedTotal;
 const supplied=tenders.reduce((n,t)=>n+(Number.isFinite(Number(t.amount))?cent(t.amount):0),0)/100,change=Math.max(0,cent(supplied)-cent(total))/100;
 useEffect(()=>{const el=document.querySelector('.payment-dialog'),before=document.activeElement;el.querySelector('button')?.focus();const key=e=>{if(e.key==='Escape'&&!lock.current)onClose();if(e.key==='Tab'){const all=[...el.querySelectorAll('button,input,select')].filter(x=>!x.disabled&&x.getClientRects().length);if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0]?.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);before?.focus();};},[onClose]);
 const receive=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
 const payload={comanda_id:summary.comanda.id,selection:selected.map(p=>({id:p.id,quantity:p.quantity})),expected_total:total,...(advance?{amount:total}:{}),tenders:tenders.map(t=>({...t,amount:Number(t.amount)}))};
 const fingerprint=JSON.stringify(payload);if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,key:crypto.randomUUID()};
 const result=await cashOperation('receive',{...payload,request_key:request.current.key});onPaid(result);
 }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}};
 const split=()=>{const n=Math.min(20,Math.max(1,Math.floor(Number(people)||1))),c=cent(total),base=Math.floor(c/n);setTenders(Array.from({length:n},(_,i)=>({method:'pix',amount:((base+(i<c%n?1:0))/100).toFixed(2)})));};
 const addTender=method=>setTenders(t=>[...t,{method,amount:Math.max(0,total-supplied).toFixed(2)}]);
 return <div className="payment-backdrop"><section className="payment-dialog" role="dialog" aria-modal="true" aria-label="Receber pagamento"><header><div><small>COMANDA {summary.comanda.id} · MESA {summary.comanda.mesa}</small><h2>Conferir e rachar a conta</h2></div><button className="btn btn-secondary" disabled={busy} onClick={onClose}>Voltar</button></header>
 <div className="payment-columns">
 <aside className="payment-methods-panel">
 <h3>Adicionar pagamento</h3>
 <div className="payment-method-grid">{Object.entries(methods).map(([k,v])=><button type="button" key={k} className="payment-method-btn" disabled={busy||total<=0} onClick={()=>addTender(k)}><Icon name={methodIcons[k]} size={18}/>{v}</button>)}</div>
 <div className="payment-split"><label>Dividir entre <input aria-label="Pessoas para dividir" type="number" min="1" max="20" value={people} disabled={busy} onChange={e=>setPeople(e.target.value)}/> pessoas</label><button className="btn btn-secondary" disabled={busy} onClick={split}>Dividir valor</button></div>
 </aside>
 <div className="payment-main">
 <div className="payment-body">
 <div className="payment-summary">
 <div className="payment-summary-header"><span>Itens do pedido</span><strong>{money(total)}</strong></div>
 <div className="payment-summary-content">
 <p className="payment-summary-hint">Selecione as unidades de cada produto a receber agora, ou escolha um valor a descontar do subtotal abaixo. O restante permanece na comanda.</p>
 {summary.pedidos.map(p=><label className="payment-item" key={p.id}><span>{p.item_name}<small>{money(p.unit_price)} por unidade</small></span><input aria-label={'Quantidade de '+p.item_name} type="number" min="0" max={p.quantity} step="1" disabled={busy||advance||summary.credit>0} value={quantities[p.id]} onChange={e=>setQuantities({...quantities,[p.id]:e.target.value})}/><span>de {p.quantity}</span></label>)}
 <div className="payment-breakdown"><span>Consumo {money((subtotal-couvert)/100)}</span><span>Couvert {money(couvert/100)}</span><span>Serviço {money(service/100)}</span></div>
 <p>Adiantamentos a descontar: {money(summary.credit||0)}</p>
 <div className="payment-advance-toggle">
 <label><input type="checkbox" checked={advance} disabled={busy} onChange={e=>{setAdvance(e.target.checked);setQuantities(Object.fromEntries(summary.pedidos.map(p=>[p.id,p.quantity])));}}/> Ou receber um valor fechado (desconta do subtotal)</label>
 {advance&&<label className="payment-advance-value">Valor a receber agora<input aria-label="Valor parcial" type="number" min="0.01" step="0.01" value={partial} disabled={busy} onChange={e=>{setPartial(e.target.value);setTenders([{method:"pix",amount:e.target.value}]);}}/><small>O valor fica como adiantamento. Os itens são liquidados ao receber o saldo final.</small></label>}
 </div>
 </div>
 </div>
 <h3>Pagamentos lançados <span>({tenders.length})</span></h3>
 {!tenders.length&&<p className="payment-tenders-empty">Nenhum pagamento lançado ainda. Escolha uma forma ao lado.</p>}
 {tenders.map((t,i)=><div className="payment-tender" key={i}><span className="payment-tender-icon"><Icon name={methodIcons[t.method]} size={16}/></span><span className="payment-tender-method">{methods[t.method]}</span><input aria-label={'Valor do pagamento '+(i+1)} type="number" min="0.01" step="0.01" disabled={busy} value={t.amount} onChange={e=>setTenders(tenders.map((x,j)=>j===i?{...x,amount:e.target.value}:x))}/><button type="button" aria-label={'Remover pagamento '+(i+1)} disabled={busy||tenders.length===1} className="payment-tender-remove" onClick={()=>setTenders(tenders.filter((_,j)=>j!==i))}><Icon name="trash" size={15}/></button></div>)}
 {error&&<p className="error-banner" role="alert">{error}</p>}
 </div>
 <footer>
 <div className="payment-progress"><div className="payment-progress-bar"><span style={{width:`${Math.min(100,total>0?(supplied/total)*100:0)}%`}}/></div><div className="payment-progress-labels"><span>Total pago <strong>{money(Math.min(supplied,total))}</strong></span><span>{supplied<total?'Falta pagar':'Troco'} <strong>{money(supplied<total?total-supplied:change)}</strong></span></div></div>
 <button className="btn btn-primary" disabled={busy||!selected.length||supplied<total||total<=0||(advance&&total>=selectedTotal)} onClick={receive}>{busy?'Registrando…':'Confirmar recebimento'}</button>
 </footer>
 </div>
 </div>
 </section></div>;
}
