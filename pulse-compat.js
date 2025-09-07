// Minimal compatibility so Pulse renders even if some API routes differ
(async () => {
  // Gentle fetch wrapper: returns fallback instead of throwing
  async function safeJson(url, fallback) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(r.statusText);
      return await r.json();
    } catch (e) { return fallback; }
  }

  // If /api/cg/top is missing, try older /api/coingecko
  const test = await fetch('/api/cg/top?limit=1').catch(()=>null);
  if (!test || !test.ok) {
    window.fetch = ((orig) => async (url, opts) => {
      if (typeof url === 'string' && url.startsWith('/api/cg/top')) {
        const q = new URLSearchParams(url.split('?')[1] || '');
        const lim = Number(q.get('limit') || 250);
        // Try legacy endpoint; map to expected structure
        const legacy = await safeJson('/api/coingecko', []);
        const items = (Array.isArray(legacy) ? legacy : (legacy.items||[])).slice(0, lim).map(x => ({
          id: x.id || x.coin_id || x.name?.toLowerCase(),
          symbol: (x.symbol || '').toLowerCase(),
          name: x.name || x.title || x.symbol?.toUpperCase(),
          market_cap_rank: x.rank || x.market_cap_rank || null,
          current_price: x.current_price ?? x.price ?? null,
          price_change_percentage_1h_in_currency: x.pct_1h ?? x.change_1h ?? 0,
          price_change_percentage_24h_in_currency: x.pct_24h ?? x.change_24h ?? 0
        }));
        return new Response(new Blob([JSON.stringify(items)], {type:'application/json'}), { status: 200 });
      }
      return orig(url, opts);
    })(window.fetch);
  }

  // Provide harmless fallbacks for /api/symbols and /api/resolve if missing
  // so search → Set still updates the UI and broadcasts the symbol.
  const ping = await fetch('/api/symbols?q=BTC').catch(()=>null);
  if (!ping || !ping.ok) {
    window.fetch = ((orig) => async (url, opts) => {
      if (typeof url === 'string' && url.startsWith('/api/symbols')) {
        const mock = { items: [{ symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', venues: ['Binance','Bybit'] }] };
        return new Response(new Blob([JSON.stringify(mock)], {type:'application/json'}), { status: 200 });
      }
      if (typeof url === 'string' && url.startsWith('/api/resolve')) {
        const q = new URLSearchParams(url.split('?')[1]||'').get('q') || 'BTCUSDT';
        const sym = String(q).toUpperCase().replace(/[^A-Z0-9]/g,'') || 'BTCUSDT';
        return new Response(new Blob([JSON.stringify({ symbol: sym })], {type:'application/json'}), { status: 200 });
      }
      return orig(url, opts);
    })(window.fetch);
  }

  // If /api/depth missing, draw neutral gauges so the rest still renders
  const dp = await fetch('/api/depth?symbol=BTCUSDT&limit=1').catch(()=>null);
  if (!dp || !dp.ok) {
    window.fetch = ((orig) => async (url, opts) => {
      if (typeof url === 'string' && url.startsWith('/api/depth')) {
        const mock = {
          venue: 'mock',
          bidPct: 50, askPct: 50,
          last: 60000,
          bids: [[59950, 12],[59900,10],[59850,8],[59800,6],[59750,5]],
          asks: [[60050, 12],[60100,10],[60150,8],[60200,6],[60250,5]]
        };
        return new Response(new Blob([JSON.stringify(mock)], {type:'application/json'}), { status: 200 });
      }
      return orig(url, opts);
    })(window.fetch);
  }
})();
