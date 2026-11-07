
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS")
      return new Response(null, { headers: CORS });

    if (url.pathname === "/api/health")
      return json({ online: true, service: "VEX PROXY" });

    if (url.pathname === "/api/scores" && request.method === "GET") {
      if (!env.VEX_SCORES) return json({ scores: [] });
      const scores = await env.VEX_SCORES.get("tetris", "json") || [];
      return json({ scores });
    }

    if (url.pathname === "/api/scores" && request.method === "POST") {
      if (!env.VEX_SCORES)
        return json({ error: "KV storage not configured" }, 503);

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON" }, 400); }

      const name = String(body.name || "PLAYER").trim().slice(0, 16);
      const score = Math.floor(Number(body.score));

      if (!Number.isFinite(score) || score < 0 || score > 100000000)
        return json({ error: "Invalid score" }, 400);

      const scores = await env.VEX_SCORES.get("tetris", "json") || [];
      scores.push({ name, score, date: new Date().toISOString() });
      scores.sort((a, b) => b.score - a.score);

      const top = scores.slice(0, 50);
      await env.VEX_SCORES.put("tetris", JSON.stringify(top));

      return json({ success: true, scores: top });
    }

    return json({ error: "Not found" }, 404);
  }
};
