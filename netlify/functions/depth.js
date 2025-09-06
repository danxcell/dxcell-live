// netlify/functions/depth.js
exports.handler = async (event) => {
  const params = new URLSearchParams(event.queryStringParameters || {});
  const symbol = (params.get("symbol") || "BTCUSDT").toUpperCase();
  const levels = Math.min(+params.get("levels") || 25, 200);
  const venueReq = (params.get("venue") || "smart").toLowerCase(); // okx | binance | smart
  const wantFull = params.get("full") === "1";
  const limit = Math.min(+params.get("limit") || 50, 500);

  const tryOkx = async () => {
    const instId = symbol.replace("USDT", "-USDT");
    const url = `https://www.okx.com/api/v5/market/books?instId=${instId}&sz=${Math.max(levels, 25)}`;
    const r = await fetch(url, { headers: { "User-Agent": "dxlt" } });
    if (!r.ok) throw new Error("okx " + r.status);
    const j = await r.json();
    const d = j?.data?.[0];
    if (!d) throw new Error("okx empty");
    const map = (arr) => arr.slice(0, levels).map(a => [Number(a[0]), Number(a[1])]);
    const bids = map(d.bids);
    const asks = map(d.asks);
    const last = Number(d?.ts ? d?.px || bids[0]?.[0] || asks[0]?.[0] : bids[0]?.[0] || asks[0]?.[0]);
    return { venue: "okx", bids, asks, last };
  };

  const tryBinance = async () => {
    const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${Math.max(levels, 50)}`;
    const r = await fetch(url, { headers: { "User-Agent": "dxlt" } });
    if (!r.ok) throw new Error("binance " + r.status);
    const j = await r.json();
    const map = (arr) => arr.slice(0, levels).map(a => [Number(a[0]), Number(a[1])]);
    const bids = map(j.bids);
    const asks = map(j.asks);
    const mid  = (bids[0]?.[0] && asks[0]?.[0]) ? (bids[0][0] + asks[0][0]) / 2 : (bids[0]?.[0] || asks[0]?.[0]);
    return { venue: "binance", bids, asks, last: mid };
  };

  let book;
  try {
    if (venueReq === "okx") book = await tryOkx();
    else if (venueReq === "binance") book = await tryBinance();
    else {
      // smart fallback: OKX → Binance
      try { book = await tryOkx(); }
      catch { book = await tryBinance(); }
    }
  } catch (e) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: e.message || String(e) })
    };
  }

  // bid/ask %
  const sum = (arr, n) => arr.slice(0, n).reduce((s, x) => s + (x[1] || 0), 0);
  const n = Math.min(levels, book.bids.length, book.asks.length);
  const bidNotional = sum(book.bids, n);
  const askNotional = sum(book.asks, n);
  const total = bidNotional + askNotional || 1;
  const bidPct = +(bidNotional / total * 100).toFixed(2);
  const askPct = +(askNotional / total * 100).toFixed(2);

  const base = { venue: book.venue, symbol, levels: n, bidPct, askPct };

  if (wantFull) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...base, last: book.last, bids: book.bids.slice(0, limit), asks: book.asks.slice(0, limit) })
    };
  }
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(base)
  };
};
