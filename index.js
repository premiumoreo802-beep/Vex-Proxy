
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === "/api/health") {
      return reply({ online: true, name: "VEX TETRIS API" });
    }

    if (url.pathname === "/api/scores" && request.method === "GET") {
      if (!env.VEX_SCORES) return reply({ scores: [], storage: false });
      const scores = await env.VEX_SCORES.get("leaderboard", "json") || [];
      return reply({ scores, storage: true });
    }

    if (url.pathname === "/api/scores" && request.method === "POST") {
      let data;
      try { data = await request.json(); }
      catch { return reply({ error: "Invalid JSON" }, 400); }

      const name = String(data.name || "PLAYER").trim().slice(0, 16);
      const score = Math.floor(Number(data.score));

      if (!Number.isFinite(score) || score < 0 || score > 100000000) {
        return reply({ error: "Invalid score" }, 400);
      }

      if (!env.VEX_SCORES) {
        return reply({ error: "Leaderboard storage is not configured" }, 503);
      }

      const scores = await env.VEX_SCORES.get("leaderboard", "json") || [];
      scores.push({ name, score, date: new Date().toISOString() });
      scores.sort((a, b) => b.score - a.score);
      const top = scores.slice(0, 50);

      await env.VEX_SCORES.put("leaderboard", JSON.stringify(top));
      return reply({ success: true, scores: top });
    }

    return reply({ error: "Not found" }, 404);
  }
};
