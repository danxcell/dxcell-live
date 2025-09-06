// Merge spot instruments from Binance, OKX, Bybit and return suggestions
export default async (req, context) => {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().toLowerCase();
  const ttlSec = 300;

  // simple in-memory cache per instance
  globalThis.__DXLT_SYM_CACHE ||= { ts: 0, list: [] };
  const now = Date.now();
  if (!globalThis.__DXLT_SYM_CACHE.list.length || (now - globalThis.__DXLT_SYM_CACHE.ts) > ttlSec*1000) {
    const [bin, okx, byb] = await Promise.allSettled([
      fetch('https://api.binance.com/api/v3/exchangeInfo').then(r=>r.json()).catch(()=>null),
      fetch('https://www.okx.com/api/v5/public/instruments?instType=SPOT').then(r=>r.json()).catch(()=>null),
      fetch('https://api.bybit.com/v5/market/instruments-info?category=spot').then(r=>r.json()).catch(()=>null),
    ]);

    const out = new Map();

    // Binance
    try {
      const syms = (bin.value?.symbols || []).filter(s => s.status === 'TRADING');
      for (const s of syms) {
        const symbol = s.symbol;
        const base = s.baseAsset, quote = s.quoteAsset;
        const key = symbol;
        const cur = out.get(key) || { symbol, base, quote, venues: new Set() };
        cur.venues.add('binance'); out.set(key, cur);
      }
    } catch {}

    // OKX
    try {
      const syms = (okx.value?.data || []);
      for (const s of syms) {
        const base = s.baseCcy, quote = s.quoteCcy;
        const symbol = `${base}${quote}`;
        const key = symbol;
        const cur = out.get(key) || { symbol, base, quote, venues: new Set() };
        cur.venues.add('okx'); out.set(key, cur);
      }
    } catch {}

    // Bybit
    try {
      const syms = (byb.value?.result?.list || []);
      for (const s of syms) {
        const symbol = s.symbol;
        // Bybit gives "baseCoin" and "quoteCoin" on futures; spot list includes base/quote too in some regions.
        // Fallback parse:
        const m = symbol.match(/^([A-Z0-9]+?)(USDT|USD|BTC|ETH|EUR|GBP)$/i);
        const base = (s.baseCoin || (m ? m[1] : '') || '').toUpperCase();
        const quote = (s.quoteCoin || (m ? m[2] : '') || '').toUpperCase();
        const key = symbol;
        const cur = out.get(key) || { symbol, base, quote, venues: new Set() };
        cur.venues.add('bybit'); out.set(key, cur);
      }
    } catch {}

    const list = Array.from(out.values()).map(x => ({
      symbol: x.symbol.toUpperCase(),
      base: (x.base||'').toUpperCase(),
      quote: (x.quote||'').toUpperCase(),
      venues: Array.from(x.venues),
    }));

    globalThis.__DXLT_SYM_CACHE = { ts: now, list };
  }

  const all = globalThis.__DXLT_SYM_CACHE.list;
  let items = all;

  if (q) {
    // allow base, quote, or pair match; hyphens/slashes ignored
    const normq = q.replace(/[^a-z0-9]/gi,'');
    items = all.filter(x =>
      x.symbol.toLowerCase().includes(normq) ||
      x.base.toLowerCase().includes(normq)   ||
      x.quote.toLowerCase().includes(normq)
    );
  }

  // prefer USDT pairs, then USD, then others
  items.sort((a,b) => {
    const pr = (qv)=> qv.quote === 'USDT' ? 0 : qv.quote === 'USD' ? 1 : 2;
    return pr(a) - pr(b) || a.symbol.localeCompare(b.symbol);
  });

  const top = items.slice(0, 60);

  return new Response(JSON.stringify({ count: top.length, items: top }), {
    headers: { 'content-type':'application/json', 'cache-control': 'max-age=60, public' }
  });
};
