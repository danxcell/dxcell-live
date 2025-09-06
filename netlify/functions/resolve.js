// netlify/functions/resolve.js
export async function handler(event) {
  const q = (new URLSearchParams(event.rawQuery||'').get('q') || '').trim();
  if (!q) return send(400, { error: 'missing q' });

  let s = q.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (!/(USDT|USD|EUR|GBP|BTC|ETH)$/.test(s)) s = s + 'USDT'; // default to USDT
  return send(200, { symbol: s });
}
function send(code, obj){return{statusCode:code,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:JSON.stringify(obj)}}
