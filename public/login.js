const form = document.querySelector("#login-form");
const error = document.querySelector("#error");
const button = document.querySelector("#submit");
document.querySelector("#toggle-password").onclick = () => {
  const input = document.querySelector("#password");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  const toggle = document.querySelector("#toggle-password");
  toggle.textContent = show ? "숨김" : "표시";
  toggle.setAttribute("aria-pressed", String(show));
  toggle.setAttribute("aria-label", show ? "비밀번호 숨김" : "비밀번호 표시");
};
form.onsubmit = async (event) => {
  event.preventDefault();
  button.disabled = true;
  button.textContent = "로그인 중…";
  error.textContent = "";
  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email.value,
        password: form.password.value,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      error.textContent = body.error || "로그인하지 못했습니다.";
      return;
    }
    form.password.value = "";
    location.replace(body.redirect);
  } catch {
    error.textContent = "연결을 확인하고 다시 시도해 주세요.";
  } finally {
    button.disabled = false;
    button.textContent = "로그인 →";
  }
};
fetch("/auth/session")
  .then(async (response) => {
    if (response.ok) {
      const session = await response.json();
      location.replace(session.home);
    }
  })
  .catch(() => {});
