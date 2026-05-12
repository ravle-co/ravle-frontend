const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_ORIGINS = new Set([
  "https://ravle.co",
  "https://www.ravle.co",
]);

// Common disposable / throwaway-mail providers. Not exhaustive — just blocks
// the obvious offenders. Add to this list if specific domains keep slipping in.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamailblock.com",
  "tempmail.com", "temp-mail.com", "temp-mail.org", "tempmail.io",
  "10minutemail.com", "10minutemail.net", "20minutemail.com",
  "throwaway.email", "throwawaymail.com", "fakeinbox.com",
  "yopmail.com", "trashmail.com", "trashmail.de", "sharklasers.com",
  "dispostable.com", "getnada.com", "nada.email", "maildrop.cc",
  "mintemail.com", "mailnesia.com", "spambox.us", "tempinbox.com",
  "mohmal.com", "burnermail.io", "emailondeck.com", "anonbox.net",
  "spam4.me", "mailcatch.com", "trbvm.com",
]);

// In-memory token bucket per IP. Fluid Compute keeps instances warm so this
// catches repeated hits from the same client within the window. A determined
// attacker can defeat it by rotating IPs / hitting a cold instance — defense
// in depth, not a wall.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const buckets = new Map();

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const b = buckets.get(ip) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };
  if (now > b.reset) {
    b.count = 0;
    b.reset = now + RATE_LIMIT_WINDOW_MS;
  }
  b.count += 1;
  buckets.set(ip, b);
  if (buckets.size > 1000) {
    for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  }
  return b.count > RATE_LIMIT_MAX;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method" });
  }

  // Strict Origin check in production. Preview / local-dev get a pass so the
  // form can still be exercised from `vercel dev` and PR preview URLs.
  if (process.env.VERCEL_ENV === "production") {
    const origin = req.headers.origin || "";
    if (!ALLOWED_ORIGINS.has(origin)) {
      return res.status(403).json({ error: "origin" });
    }
  }

  if (rateLimited(clientIp(req))) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "rate" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const type = body.type === "beta" ? "beta" : "waitlist";
  const honeypot = typeof body.company === "string" ? body.company : "";
  const consent = body.consent === true;

  // Honeypot tripped → fake-success so the bot doesn't retry with the field empty.
  if (honeypot) {
    return res.status(200).json({ ok: true });
  }

  if (!consent) {
    return res.status(400).json({ error: "consent" });
  }

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "email" });
  }

  const domain = email.split("@")[1] || "";
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return res.status(400).json({ error: "disposable" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId =
    type === "beta"
      ? process.env.RESEND_AUDIENCE_BETA_ID
      : process.env.RESEND_AUDIENCE_WAITLIST_ID;

  if (!apiKey || !audienceId) {
    return res.status(500).json({ error: "config" });
  }

  try {
    const upstream = await fetch(
      `https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      }
    );

    if (upstream.ok || upstream.status === 409) {
      return res.status(200).json({ ok: true });
    }

    return res.status(502).json({ error: "upstream" });
  } catch {
    return res.status(502).json({ error: "upstream" });
  }
}
