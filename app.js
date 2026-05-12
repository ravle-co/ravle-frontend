(() => {
  const track = (name, data) => {
    if (typeof window.va === "function") {
      window.va("event", data ? { name, data } : { name });
    }
  };

  // -----------------------------------------------------------------------
  // Signup form
  // -----------------------------------------------------------------------
  const form = document.getElementById("signup");
  const status = document.getElementById("status");
  const submit = document.getElementById("submit");
  const emailInput = document.getElementById("email");
  const consentInput = document.getElementById("consent");

  if (form && status && submit && emailInput) {
    const setStatus = (msg, kind) => {
      status.textContent = msg;
      status.classList.remove("text-win", "text-primary-deep");
      if (kind === "success") status.classList.add("text-win");
      if (kind === "error") status.classList.add("text-primary-deep");
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submit.disabled) return;

      const fd = new FormData(form);
      const email = String(fd.get("email") || "").trim();
      const type = String(fd.get("type") || "waitlist");
      const company = String(fd.get("company") || "");

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setStatus("That email doesn't look right.", "error");
        emailInput.focus();
        return;
      }

      if (consentInput && !consentInput.checked) {
        setStatus("Please agree to the privacy policy first.", "error");
        consentInput.focus();
        track("signup_attempt_blocked", { reason: "consent", type });
        return;
      }

      submit.disabled = true;
      setStatus("Sending…");

      try {
        const res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            type,
            company,
            consent: consentInput ? consentInput.checked === true : false,
          }),
        });

        if (res.ok) {
          const msg =
            type === "beta"
              ? "You're in the beta queue. We'll reach out."
              : "You're on the list. See you at launch.";
          setStatus(msg, "success");
          form.reset();
          track("signup", { type });
        } else {
          const data = await res.json().catch(() => ({}));
          const messages = {
            email: "That email doesn't look right.",
            consent: "Please agree to the privacy policy first.",
            disposable: "Please use a real email address.",
            rate: "Too many tries — wait a minute and try again.",
          };
          setStatus(
            messages[data.error] || "Something went wrong. Try again in a bit.",
            "error"
          );
        }
      } catch {
        setStatus("Network hiccup. Try again.", "error");
      } finally {
        submit.disabled = false;
      }
    });
  }

  // -----------------------------------------------------------------------
  // Reveal-on-scroll — IntersectionObserver, GPU-friendly fade-up.
  // Cheap to run; observers self-disconnect once an element is visible.
  // -----------------------------------------------------------------------
  const reveals = document.querySelectorAll(".reveal, .reveal-stagger");
  if (reveals.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    // Fallback: just show everything.
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  // -----------------------------------------------------------------------
  // Analytics: CTA clicks (any [data-cta]) and 75% scroll depth.
  // -----------------------------------------------------------------------
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target instanceof Element ? e.target.closest("[data-cta]") : null;
      if (el) track("cta_click", { location: el.getAttribute("data-cta") || "unknown" });
    },
    { passive: true }
  );

  let scrollFired = false;
  try {
    if (sessionStorage.getItem("ravle_scroll_75") === "1") scrollFired = true;
  } catch {}
  const onScroll = () => {
    if (scrollFired) return;
    const doc = document.documentElement;
    const total = doc.scrollHeight - doc.clientHeight;
    if (total <= 0) return;
    const ratio = (window.scrollY || doc.scrollTop) / total;
    if (ratio >= 0.75) {
      scrollFired = true;
      try { sessionStorage.setItem("ravle_scroll_75", "1"); } catch {}
      track("scroll_75");
      window.removeEventListener("scroll", onScroll);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
})();
