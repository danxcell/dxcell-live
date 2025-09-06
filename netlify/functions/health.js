
const { helpers } = require("./_common.js");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return helpers.preflight(event);
  const headers = { ...helpers.corsHeaders(event.headers.origin || event.headers.Origin || ""), ...helpers.cacheHeaders(5,5) };
  return { statusCode: 200, headers, body: JSON.stringify({ ok:true, ts: Date.now() }) };
};
