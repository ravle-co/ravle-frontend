const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const type = body.type === "beta" ? "beta" : "waitlist";
  const honeypot = typeof body.company === "string" ? body.company : "";

  if (honeypot) {
    return res.status(200).json({ ok: true });
  }

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "email" });
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
