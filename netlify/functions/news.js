
const { helpers } = require("./_common.js");

const FEEDS = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed",
  "https://bitcoinmagazine.com/.rss/full/"
];

function parseRSS(xml){
  const out = [];
  const items = xml.split(/<item>/g).slice(1);
  for (const it of items){
    const title = (it.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s)?.[1] ||
                   it.match(/<title>(.*?)<\/title>/s)?.[1] || "").trim();
    const link  = (it.match(/<link>(.*?)<\/link>/s)?.[1] || "").trim();
    const date  = (it.match(/<pubDate>(.*?)<\/pubDate>/s)?.[1] || "").trim();
    if (title && link) out.push({ title, link, date });
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return helpers.preflight(event);
  const headers = { ...helpers.corsHeaders(event.headers.origin || event.headers.Origin || ""), ...helpers.cacheHeaders(120,180) };

  try{
    const qs = new URL(event.rawUrl).searchParams;
    const limit = Math.min(parseInt(qs.get("limit")||"30",10), 50);

    let all = [];
    await Promise.all(FEEDS.map(async(u)=>{
      try{
        const r = await helpers.safeFetch(u);
        const xml = await r.text();
        all = all.concat(parseRSS(xml).slice(0, 15));
      }catch(e){}
    }));

    const seen = new Set();
    const dedup = [];
    for (const item of all){
      const key = item.title.toLowerCase().replace(/\s+/g," ").slice(0,120);
      if (!seen.has(key)) { seen.add(key); dedup.push(item); }
    }

    return { statusCode: 200, headers, body: JSON.stringify(dedup.slice(0, limit)) };
  }catch(err){
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
