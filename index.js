
const MAX_SIZE = 2 * 1024 * 1024;
const TIMEOUT = 12000;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function validURL(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".test") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.")
  ) return false;

  if (
    host.startsWith("172.") &&
    Number(host.split(".")[1]) >= 16 &&
    Number(host.split(".")[1]) <= 31
  ) return false;

  if (url.port && !["80", "443"].includes(url.port)) {
    return false;
  }

  return true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    const allowed = [
      env.SITE_ORIGIN,
      "https://*.pages.dev"
    ];

    const originAllowed =
      origin === env.SITE_ORIGIN ||
      (origin.endsWith(".pages.dev") &&
       origin.startsWith("https://"));

    const responseOrigin = originAllowed
      ? origin
      : env.SITE_ORIGIN;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors(responseOrigin),
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        success: true,
        service: "Vex Gateway",
        version: "1.0.0",
        status: "online"
      }, 200, responseOrigin);
    }

    if (url.pathname !== "/api/fetch") {
      return json({
        success: false,
        error: "Endpoint not found"
      }, 404, responseOrigin);
    }

    if (!originAllowed) {
      return json({
        success: false,
        error: "Origin not allowed"
      }, 403, responseOrigin);
    }

    if (request.method !== "POST") {
      return json({
        success: false,
        error: "Use POST"
      }, 405, responseOrigin);
    }

    try {
      const body = await request.json();
      const target = body.url;

      if (typeof target !== "string" || !validURL(target)) {
        return json({
          success: false,
          error: "Invalid or unsupported URL"
        }, 400, responseOrigin);
      }

      let current = target;
      let upstream;

      for (let i = 0; i <= 3; i++) {
        if (!validURL(current)) {
          return json({
            success: false,
            error: "Unsafe redirect destination"
          }, 403, responseOrigin);
        }

        upstream = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(TIMEOUT),
          headers: {
            "User-Agent": "VexProxy/1.0",
            "Accept": "text/html,application/xhtml+xml,text/plain"
          }
        });

        if (
          upstream.status >= 300 &&
          upstream.status < 400
        ) {
          const location = upstream.headers.get("Location");

          if (!location || i === 3) {
            return json({
              success: false,
              error: "Too many redirects"
            }, 502, responseOrigin);
          }

          current = new URL(location, current).href;
          continue;
        }

        break;
      }

      if (!upstream || !upstream.ok) {
        return json({
          success: false,
          error: "Website returned an error",
          status: upstream?.status || 502
        }, 502, responseOrigin);
      }

      const type = upstream.headers.get("Content-Type") || "";

      if (
        !type.includes("text/html") &&
        !type.includes("text/plain") &&
        !type.includes("application/xhtml+xml")
      ) {
        return json({
          success: false,
          error: "Unsupported content type"
        }, 415, responseOrigin);
      }

      const declaredSize = Number(
        upstream.headers.get("Content-Length") || 0
      );

      if (declaredSize > MAX_SIZE) {
        return json({
          success: false,
          error: "Page is too large"
        }, 413, responseOrigin);
      }

      const text = await upstream.text();

      if (new TextEncoder().encode(text).length > MAX_SIZE) {
        return json({
          success: false,
          error: "Page exceeded size limit"
        }, 413, responseOrigin);
      }

      return json({
        success: true,
        url: current,
        contentType: type,
        content: text
      }, 200, responseOrigin);

    } catch (error) {
      return json({
        success: false,
        error: "Request failed"
      }, 500, responseOrigin);
    }
  }
};
      
