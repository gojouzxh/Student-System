/**
 * Router — tiny hash-based router. Maps a URL pattern to a handler
 * function; handlers receive route params extracted from the hash.
 * Kept deliberately small: this skeleton needs navigation, not a
 * full framework.
 */
export class Router {
  #routes = [];
  #notFoundHandler = () => {};
  #errorHandler = (error) => { throw error; };

  add(pattern, handler) {
    const paramNames = [];
    const regexStr = pattern
      .replace(/\//g, "\\/")
      .replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return "([^/]+)";
      });
    this.#routes.push({ regex: new RegExp(`^${regexStr}$`), paramNames, handler });
    return this;
  }

  notFound(handler) {
    this.#notFoundHandler = handler;
    return this;
  }

  onError(handler) {
    this.#errorHandler = handler;
    return this;
  }

  start() {
    window.addEventListener("hashchange", () => this.#resolve());
    this.#resolve();
  }

  navigate(hash) {
    if (window.location.hash === hash) this.#resolve();
    else window.location.hash = hash;
  }

  #resolve() {
    const hash = window.location.hash || "#/dashboard";
    const [path, query = ""] = (hash.slice(1) || "/dashboard").split("?", 2);

    for (const route of this.#routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
        params.query = new URLSearchParams(query);
        try {
          route.handler(params);
        } catch (error) {
          this.#errorHandler(error);
        }
        return;
      }
    }
    this.#notFoundHandler();
  }
}
