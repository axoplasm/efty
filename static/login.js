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
