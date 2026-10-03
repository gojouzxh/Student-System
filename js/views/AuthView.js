const PAGE_COPY = {
  login: {
    eyebrow: "YOUR STUDY SPACE",
    title: "Welcome back.",
    description: "Sign in to pick up where your learning left off.",
  },
  register: {
    eyebrow: "A FRESH START",
    title: "Create your account.",
    description: "One account for your quizzes, study sessions, and progress.",
  },
  forgot: {
    eyebrow: "ACCOUNT RECOVERY",
    title: "Reset your password.",
    description: "We’ll email a secure, time-limited reset link if an account matches.",
  },
  reset: {
    eyebrow: "ACCOUNT RECOVERY",
    title: "Choose a new password.",
    description: "Make it strong and unique to keep your study space safe.",
  },
};

function formMarkup(mode, resetToken) {
  if (mode === "login") {
    return `
      <form class="auth-form" data-auth-form novalidate>
        <label for="auth-identifier">Username or email</label>
        <input id="auth-identifier" name="identifier" autocomplete="username" required maxlength="254" autofocus>
        <label for="auth-password">Password</label>
        <div class="auth-password">
          <input id="auth-password" name="password" type="password" autocomplete="current-password" required>
          <button class="auth-password__toggle" type="button" data-password-toggle aria-label="Show password" aria-pressed="false">Show</button>
        </div>
        <div class="auth-options">
          <label class="auth-check"><input type="checkbox" name="rememberMe" value="true"> <span>Remember me</span></label>
          <a href="#/forgot-password">Forgot password?</a>
        </div>
        <p class="auth-message" data-auth-message role="status" aria-live="polite"></p>
        <button class="auth-submit" type="submit">Sign in</button>
      </form>
      <p class="auth-switch">New to Coursework? <a href="#/register">Create an account</a></p>`;
  }

  if (mode === "register") {
    return `
      <form class="auth-form" data-auth-form novalidate>
        <label for="auth-name">Full name</label>
        <input id="auth-name" name="name" autocomplete="name" required minlength="2" maxlength="100" autofocus>
        <label for="auth-username">Username</label>
        <input id="auth-username" name="username" autocomplete="username" required minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" aria-describedby="username-hint">
        <span class="auth-hint" id="username-hint">3–30 letters, numbers, or underscores.</span>
        <label for="auth-email">Email</label>
        <input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="254">
        <label for="auth-password">Password</label>
        <div class="auth-password">
          <input id="auth-password" name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128" aria-describedby="password-hint">
          <button class="auth-password__toggle" type="button" data-password-toggle aria-label="Show password" aria-pressed="false">Show</button>
        </div>
        <span class="auth-hint" id="password-hint">12+ characters with uppercase, lowercase, number, and symbol.</span>
        <label for="auth-confirm-password">Confirm password</label>
        <input id="auth-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128">
        <label class="auth-check auth-check--terms"><input type="checkbox" name="acceptTerms" value="true" required> <span>I agree to the terms and conditions.</span></label>
        <p class="auth-message" data-auth-message role="status" aria-live="polite"></p>
        <button class="auth-submit" type="submit">Create account</button>
      </form>
      <p class="auth-switch">Already have an account? <a href="#/login">Sign in</a></p>`;
  }

  if (mode === "forgot") {
    return `
      <form class="auth-form" data-auth-form novalidate>
        <label for="auth-email">Email address</label>
        <input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="254" autofocus>
        <p class="auth-message" data-auth-message role="status" aria-live="polite"></p>
        <button class="auth-submit" type="submit">Send reset link</button>
      </form>
      <p class="auth-switch"><a href="#/login">Back to sign in</a></p>`;
  }

  const token = resetToken || "";
  return `
    <form class="auth-form" data-auth-form novalidate>
      <input name="token" type="hidden" value="${token}">
      <label for="auth-password">New password</label>
      <div class="auth-password">
        <input id="auth-password" name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128" aria-describedby="password-hint" autofocus>
        <button class="auth-password__toggle" type="button" data-password-toggle aria-label="Show password" aria-pressed="false">Show</button>
      </div>
      <span class="auth-hint" id="password-hint">12+ characters with uppercase, lowercase, number, and symbol.</span>
      <label for="auth-confirm-password">Confirm new password</label>
      <input id="auth-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128">
      <p class="auth-message" data-auth-message role="status" aria-live="polite"></p>
      <button class="auth-submit" type="submit" ${token ? "" : "disabled"}>Save new password</button>
    </form>
    <p class="auth-switch"><a href="#/login">Back to sign in</a></p>`;
}

export function renderAuthView(container, {
  mode,
  resetToken = "",
  initialMessage = "",
  onLogin,
  onRegister,
  onForgot,
  onReset,
}) {
  const copy = PAGE_COPY[mode];
  if (!copy) throw new Error(`Unknown authentication page: ${mode}`);
  if (mode === "reset" && !/^[A-Za-z0-9_-]{32,128}$/.test(resetToken)) resetToken = "";

  container.innerHTML = `
    <section class="auth-layout" aria-labelledby="auth-title">
      <aside class="auth-story">
        <a class="auth-brand" href="#/login" aria-label="Coursework home">
          <span class="auth-brand__mark" aria-hidden="true">§</span>
          <span>Coursework</span>
        </a>
        <div class="auth-story__content">
          <span class="auth-story__eyebrow">LEARN WITH INTENTION</span>
          <h2>Small steps.<br>Lasting progress.</h2>
          <p>Keep your learning organized, your goals in sight, and your next achievement within reach.</p>
          <div class="auth-story__rule"><span></span><span></span><span></span></div>
        </div>
        <span class="auth-story__footer">QUIZ &amp; STUDY TRACKER</span>
      </aside>
      <div class="auth-panel">
        <div class="auth-panel__inner">
          <span class="auth-eyebrow">${copy.eyebrow}</span>
          <h1 id="auth-title">${copy.title}</h1>
          <p class="auth-description">${copy.description}</p>
          ${formMarkup(mode, resetToken)}
        </div>
      </div>
    </section>`;

  const form = container.querySelector("[data-auth-form]");
  const message = container.querySelector("[data-auth-message]");
  if (initialMessage) {
    message.textContent = initialMessage;
    message.classList.add("auth-message--info");
  }

  container.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const password = button.parentElement.querySelector("input");
      const showing = password.type === "password";
      password.type = showing ? "text" : "password";
      button.textContent = showing ? "Hide" : "Show";
      button.setAttribute("aria-label", showing ? "Hide password" : "Show password");
      button.setAttribute("aria-pressed", String(showing));
    });
  });

  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    message.className = "auth-message";
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;

    const values = Object.fromEntries(new FormData(form));
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (values.password && values.password !== values.confirmPassword &&
        (mode === "register" || mode === "reset")) {
      message.textContent = "Passwords do not match.";
      message.classList.add("auth-message--error");
      form.elements.confirmPassword.focus();
      return;
    }

    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.innerHTML = '<span class="auth-spinner" aria-hidden="true"></span> Please wait…';
    message.textContent = "Connecting securely…";
    message.classList.add("auth-message--info");
    try {
      const action = { login: onLogin, register: onRegister, forgot: onForgot, reset: onReset }[mode];
      const result = await action(values);
      if (result?.message) {
        message.textContent = result.message;
        message.classList.remove("auth-message--info");
        message.classList.add("auth-message--success");
      }
    } catch (error) {
      message.textContent = error.message || "Something went wrong. Please try again.";
      message.classList.remove("auth-message--info");
      message.classList.add("auth-message--error");
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || "Continue";
        delete button.dataset.originalText;
      }
    }
  });
}
