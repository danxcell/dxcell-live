
const { helpers } = require("./_common.js");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return helpers.preflight(event);
  const headers = { ...helpers.corsHeaders(event.headers.origin || event.headers.Origin || ""), ...helpers.cacheHeaders(30,60) };

  try{
    const url = new URL(event.rawUrl);
    const path = url.pathname;
    const q = Object.fromEntries(url.searchParams);

    if (path.endsWith("/cg/market_chart")) {
      const id = q.id || "bitcoin";
      const vs = q.vs || "usd";
      const days = q.days || "1";
      const interval = q.interval || "minute";
      const target = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${vs}&days=${days}&interval=${interval}`;
      const res = await helpers.safeFetch(target);
      const body = await res.text();
      return { statusCode: res.status, headers, body };
    }

    if (path.endsWith("/cg/top")) {
      const vs = q.vs || "usd";
      const per = Math.min(parseInt(q.limit||"20",10), 50);
      const target = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs}&order=market_cap_desc&per_page=${per}&page=1&sparkline=false&price_change_percentage=1h,24h,7d`;
      const res = await helpers.safeFetch(target);
      const body = await res.text();
      return { statusCode: res.status, headers: { ...headers, ...helpers.cacheHeaders(60,90) }, body };
    }

    if (path.endsWith("/status_updates")) {
      const per = Math.min(parseInt(q.per_page||"50",10), 100);
      const target = `https://api.coingecko.com/api/v3/status_updates?per_page=${per}&page=1`;
      const res = await helpers.safeFetch(target);
      const body = await res.text();
      return { statusCode: res.status, headers: { ...headers, ...helpers.cacheHeaders(60,120) }, body };
    }

    return { statusCode: 404, headers, body: JSON.stringify({error:"unknown cg route"}) };
  }catch(err){
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
