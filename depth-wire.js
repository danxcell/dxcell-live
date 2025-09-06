(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const bidsEl = document.getElementById('mdBidsPct');
    const asksEl = document.getElementById('mdAsksPct');

    function currentSymbol() {
      // If your app sets CURRENT.symbol, use it; otherwise default.
      if (window.CURRENT && CURRENT.symbol) return String(CURRENT.symbol).toUpperCase();
      return 'BTCUSDT';
    }

    async function tick() {
      try {
        const s = currentSymbol();
        const res = await fetch(`/api/depth?symbol=${encodeURIComponent(s)}&limit=50&levels=25&venue=smart`);
        const j = await res.json();

        const bids = Number.isFinite(j.bidPct) ? j.bidPct : 0;
        const asks = Number.isFinite(j.askPct) ? j.askPct : 0;

        if (bidsEl) bidsEl.textContent = `${bids.toFixed(0)}%`;
        if (asksEl) asksEl.textContent = `${asks.toFixed(0)}%`;
      } catch (e) {
        console.warn('depth wire error', e);
      }
    }

    tick();
    setInterval(tick, 15000); // refresh every 15s
  });
})();
