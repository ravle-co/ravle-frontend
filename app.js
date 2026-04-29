(() => {
  const form = document.getElementById("signup");
  const status = document.getElementById("status");
  const submit = document.getElementById("submit");
  const emailInput = document.getElementById("email");

  if (!form || !status || !submit || !emailInput) return;

  const setStatus = (msg, kind) => {
    status.textContent = msg;
    status.classList.remove("success", "error");
    if (kind) status.classList.add(kind);
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

    submit.disabled = true;
    setStatus("Sending…");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type, company }),
      });

      if (res.ok) {
        const msg =
          type === "beta"
            ? "You're in the beta queue. We'll reach out."
            : "You're on the list. See you at launch.";
        setStatus(msg, "success");
        form.reset();
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus(
          data.error === "email"
            ? "That email doesn't look right."
            : "Something went wrong. Try again in a bit.",
          "error"
        );
      }
    } catch {
      setStatus("Network hiccup. Try again.", "error");
    } finally {
      submit.disabled = false;
    }
  });
})();
