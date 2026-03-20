// ── Tab switching ──

document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("selected"));
        tab.classList.add("selected");
        const which = tab.dataset.tab;
        document.getElementById("login-form").hidden = which !== "login";
        document.getElementById("register-form").hidden = which !== "register";
    });
});

// ── Login ──

document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("login-error");
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
        window.location.href = "/";
    } else {
        const data = await res.json();
        errorEl.textContent = data.error;
        errorEl.hidden = false;
    }
});

// ── Register ──

document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("register-error");
    const username = document.getElementById("reg-username").value.trim();
    const password = document.getElementById("reg-password").value;

    const res = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
        const data = await res.json();
        errorEl.textContent = data.error;
        errorEl.hidden = false;
        return;
    }

    // Auto-login after successful registration.
    const loginRes = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });
    if (loginRes.ok) window.location.href = "/";
});
