const { helpers } = require("./_common.js");

async function fetchBinance(symbol, limit=50){
  const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`;
  const res = await helpers.safeFetch(url);
  if (!res || !res.ok) return { bids:[], asks:[] };
  const j = await res.json();
  return { bids: j.bids || [], asks: j.asks || [] };
}
async function fetchOKX(symbol, limit=50){
  const inst = symbol.replace("USDT","-USDT");
  const url  = `https://www.okx.com/api/v5/market/books?instId=${inst}&sz=${limit}`;
  const res  = await helpers.safeFetch(url);
  if (!res || !res.ok) return { bids:[], asks:[] };
  const j    = await res.json();
  const d    = j.data?.[0] || { bids:[], asks:[] };
  return { bids: d.bids || [], asks: d.asks || [] };
}
async function fetchBybit(symbol, limit=50){
  const url = `https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${symbol}&limit=${limit}`;
  const res = await helpers.safeFetch(url);
  if (!res || !res.ok) return { bids:[], asks:[] };
  const j   = await res.json();
  const list= j.result?.list || [];
  const bids= list.filter(x=>x.side==="Buy").map(x=>[x.price,x.size]);
  const asks= list.filter(x=>x.side==="Sell").map(x=>[x.price,x.size]);
  return { bids, asks };
}

function sumNotional(levels, take=25){
  return (levels||[]).slice(0,take).reduce((a,[p,q]) => a + ((parseFloat(p)||0)*(parseFloat(q)||0)), 0);
}
const FETCHERS = {
  binance: fetchBinance,
  okx:     fetchOKX,
  bybit:   fetchBybit
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return helpers.preflight(event);
  const headers = { ...helpers.corsHeaders(event.headers.origin || event.headers.Origin || ""), ...helpers.cacheHeaders(10,20) };

  try{
    const url = new URL(event.rawUrl);
    const q   = Object.fromEntries(url.searchParams);
    const symbol = (q.symbol || "BTCUSDT").toUpperCase();
    const limit  = Math.min(parseInt(q.limit || "50",10), 100);
    const levels = Math.min(parseInt(q.levels|| "25",10), limit);
    const prefer = (q.venue || "smart").toLowerCase();

    const order = prefer === "smart"
      ? ["binance","okx","bybit"]
      : [prefer, ...["binance","okx","bybit"].filter(v => v !== prefer)];

    let used = null, book = { bids:[], asks:[] };
    for (const v of order) {
      const f = FETCHERS[v];
      try {
        const b = await f(symbol, limit);
        if ((b.bids?.length || 0) > 0 && (b.asks?.length || 0) > 0) { used = v; book = b; break; }
      } catch (_) {}
    }
    if (!used) { used = "none"; } // everything failed

    const bidNotional = sumNotional(book.bids, levels);
    const askNotional = sumNotional(book.asks, levels);
    const total = (bidNotional + askNotional) || 1;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        venue: used,
        symbol, levels,
        bidPct: +(bidNotional/total*100).toFixed(2),
        askPct: +(askNotional/total*100).toFixed(2)
      })
    };
  }catch(err){
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
