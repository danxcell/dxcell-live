
/* feeds.js â€” LIVE X Feed + Calendar (Crypto/FX)
 * Sources:
 *  - X/News: CryptoPanic public posts (no token needed for public=true)
 *  - Calendar All/FX: TradingEconomics guest:guest
 *  - Calendar Crypto: CoinGecko status updates
 * Tabs:
 *  #newsFeed .filters .seg[data-filter="all|news|x|alerts"]
 *  #calendarFeed .filters .seg[data-cal="all|crypto|fx"]
*/

(() => {
  const PROXY = ""; // optional: "/.netlify/functions/proxy?url="

  const q = (s, c=document) => c.querySelector(s);
  const qa = (s, c=document) => Array.from(c.querySelectorAll(s));
  const proxify = url => PROXY ? (PROXY + encodeURIComponent(url)) : url;

  function utcShort(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return (ts || "");
    return d.toUTCString().slice(5, 22) + " UTC";
  }

  function classifyItem(n){
    const title = (n.title||"").toLowerCase();
    const src = (n.source?.title || "").toLowerCase();
    const isX = src.includes("twitter") || src.includes("x ") || src === "x" ||
                /tweet|@|posted on x/.test(title);
    const isAlert = /whale|moved|transfer|hack|exploit|rug|liquidation|alert|drained|stolen/.test(title);
    return isAlert ? 'alerts' : (isX ? 'x' : 'news');
  }

  // ---- X FEED ----
  let FEED_DATA = [];
  let FEED_FILTER = 'all';

  async function loadNews(){
    try{
      const url = proxify("/api/news?limit=30");
      const r = await fetch(url, { mode: "cors" });
      const j = await r.json();
      FEED_DATA = j.results || [];
      renderFeed();
    }catch(e){
      console.error("X/News feed failed:", e);
      const box = q("#newsContent");
      if (box) box.innerHTML = `<div class="news-item">Unable to load X/News feed.</div>`;
    }
  }

  function renderFeed(){
    const box = q("#newsContent");
    if (!box) return;
    box.innerHTML = "";

    const items = FEED_DATA
      .filter(n => FEED_FILTER==='all' || classifyItem(n)===FEED_FILTER)
      .slice(0, 14);

    if (!items.length){
      box.innerHTML = `<div class="news-item">No items for this filter yet.</div>`;
      return;
    }

    items.forEach(n => {
      const srcTitle = n.source?.title || "source";
      const when = utcShort(n.published_at || Date.now());
      const kind = classifyItem(n);
      const el = document.createElement("div");
      el.className = "news-item";
      el.innerHTML = `
        <div class="meta">
          <span class="src">X â€¢ @${srcTitle}</span>
          <span class="time">${when}</span>
        </div>
        <div class="title">${n.title || ""}</div>
        <div class="badges">
          ${kind==='alerts' ? `<span class="btn-pill alert">ALERT</span>` : ``}
          <a class="btn-pill view" href="${n.url || '#'}" target="_blank" rel="noopener">VIEW</a>
        </div>
      `;
      box.appendChild(el);
    });
  }

  function bindFeedFilters(){
    qa('#newsFeed .filters .seg').forEach(btn => {
      btn.addEventListener('click', () => {
        FEED_FILTER = btn.dataset.filter;
        qa('#newsFeed .filters .seg').forEach(b=>b.classList.toggle('on', b===btn));
        renderFeed();
      });
    });
  }

  // ---- CALENDAR ----
  let CAL_FILTER = 'all';
  let TE_DATA = [];   // TradingEconomics
  let CGK_DATA = [];  // CoinGecko

  async function loadTE(){
    try{
      const url = proxify("https://api.tradingeconomics.com/calendar?c=guest:guest&f=json");
      const r = await fetch(url, { mode:"cors" });
      TE_DATA = await r.json() || [];
      renderCalendar();
    }catch(e){
      console.error("TradingEconomics fail:", e);
    }
  }

  async function loadCoinGecko(){
    try{
      const url = proxify("/api/status_updates");
      const r = await fetch(url, { mode:"cors" });
      const j = await r.json();
      CGK_DATA = j.status_updates || [];
      renderCalendar();
    }catch(e){
      console.error("CoinGecko status fail:", e);
    }
  }

  function renderCalendar(){
    const tb = q("#calendarTable tbody");
    if (!tb) return;
    tb.innerHTML = "";

    if (CAL_FILTER==='crypto'){
      CGK_DATA.slice(0, 20).forEach(u => {
        const t = utcShort(u.created_at);
        const ev = (u.project?.name || "Update") + " â€” " + (u.description || "").replace(/\s+/g,' ').trim();
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${t}</td>
          <td>${ev}</td>
          <td></td><td></td><td></td>
          <td class="neu"></td>
        `;
        tb.appendChild(tr);
      });
      return;
    }

    const filtered = (TE_DATA || []).filter(ev => {
      if (CAL_FILTER==='all') return true;
      if (CAL_FILTER==='fx'){
        const k = (ev.Currency || ev.Country || "").toString();
        return /USD|EUR|JPY|GBP|AUD|CAD|NZD|CNY/i.test(k);
      }
      return true;
    }).slice(0, 40);

    filtered.forEach(ev => {
      const dateStr = utcShort(ev.Date || ev.Datetime || ev.Time);
      const prev = ev.Previous ?? "";
      const forecast = ev.Forecast ?? "";
      const actual = ev.Actual ?? "";
      const delta = (parseFloat(actual) || 0) - (parseFloat(forecast) || 0);
      let cls = 'neu'; if (isFinite(delta) && delta>0) cls='pos'; if (isFinite(delta) && delta<0) cls='neg';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${dateStr}</td>
        <td>${ev.Event || ''}</td>
        <td>${prev}</td>
        <td>${forecast}</td>
        <td>${actual}</td>
        <td class="${cls}">${isFinite(delta) ? delta.toFixed(2) : ''}</td>
      `;
      tb.appendChild(tr);
    });
  }

  function bindCalFilters(){
    qa('#calendarFeed .filters .seg').forEach(btn => {
      btn.addEventListener('click', () => {
        CAL_FILTER = btn.dataset.cal;
        qa('#calendarFeed .filters .seg').forEach(b=>b.classList.toggle('on', b===btn));
        renderCalendar();
      });
    });
  }

  // Boot
  bindFeedFilters();
  bindCalFilters();
  loadNews();
  loadTE();
  loadCoinGecko();
  setInterval(loadNews, 30000);
  setInterval(loadTE, 60000);
  setInterval(loadCoinGecko, 45000);
})();

