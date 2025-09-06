
// Shared helpers (CORS + caching + quick retry)
const ALLOWED_ORIGINS = [
  "https://dxcell.tech",
  "http://localhost:8888",
  "http://127.0.0.1:8888",
  "http://localhost:3000"
];

function corsHeaders(origin) {
  // For first spin-up we allow the first origin; change to your domain only after testing.
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Vary": "Origin"
  };
}

function preflight(event) {
  const headers = corsHeaders(event.headers.origin || event.headers.Origin || "");
  headers["Access-Control-Max-Age"] = "86400";
  return { statusCode: 204, headers };
}

function cacheHeaders(seconds=30, stale=60){
  return { "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${stale}` };
}

async function safeFetch(url, opts={}){
  const tries = [0, 300, 800];
  let last;
  for (const wait of tries){
    if (wait) await new Promise(r => setTimeout(r, wait));
    const res = await fetch(url, { ...opts, redirect: "follow" });
    last = res;
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) continue;
    break;
  }
  return last;
}

exports.helpers = { corsHeaders, preflight, cacheHeaders, safeFetch };
