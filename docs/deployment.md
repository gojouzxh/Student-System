# Frontend and API deployment

## Architecture

The app serves a static vanilla-JavaScript frontend on GitHub Pages and runs
the Node.js 24 API separately on Render. GitHub Pages cannot execute API
routes, which is why a login `POST` sent to its origin returned an HTML
`405 Not Allowed` response.

The actual login endpoint is `POST /api/v1/auth/login`. The liveness/readiness
endpoint is `GET /api/v1/health`. The server uses `PORT` supplied by its
hosting platform and persists application collections as JSON files.

## Deploy the backend

1. Import this repository's [Render blueprint](../render.yaml) in Render. It
   runs the Node.js service from the repository root with `npm install` and
   `npm start`.
2. Choose a persistent-disk-capable plan. The blueprint mounts its disk at
   `/var/data` and sets `QSP_DATA_DIR` to that path.
3. Set `QSP_EMAIL_API_KEY` and `QSP_EMAIL_FROM` in Render's secret settings.
   Never commit their values.
4. Wait for the deployment health check at `/api/v1/health`.
5. Copy the deployed HTTPS service origin, without a trailing route path.

The app does not use SQL. Its existing JSON-file repositories require
persistent storage, and the current implementation is intended for one
backend instance.

## Connect GitHub Pages

1. In the GitHub repository, add the Actions variable `QSP_API_URL` with the
   backend HTTPS origin from Render.
2. Enable GitHub Actions as the repository's Pages source.
3. Push to `main` or manually run **Deploy frontend to GitHub Pages**.

The workflow tests the project, copies only `index.html`, `css/`, and `js/`
into `dist/`, and generates `dist/js/config.js` with the configured API
origin. It fails if `QSP_API_URL` is unset. No backend URL or secret is
copied into the shared application source.

The backend's `QSP_ALLOWED_ORIGINS` must contain the exact frontend origin
`https://gojouzxh.github.io`. The Pages URL for this deployment is
`https://gojouzxh.github.io/Student-System/`. The Render blueprint sets this origin. CORS
permits credentials only for configured origins; production cookies are
`HttpOnly`, `Secure`, and `SameSite=None`.

GitHub Pages and Render's default hostnames are cross-site. Browser privacy
settings may block their third-party cookies. For robust sign-in across
browsers, configure a custom Pages domain and a backend subdomain under the
same registrable domain, such as `learn.example.com` and `api.example.com`,
then update `QSP_ALLOWED_ORIGINS`, `QSP_PUBLIC_URL`, and `QSP_API_URL`.

## Local development

Run `npm start` on Node.js 24 and browse to `http://localhost:8080/`. The
checked-in `js/config.js` has an empty API origin, so requests use the same
origin locally. For a separate local frontend, configure its API origin and
add that exact origin to `QSP_ALLOWED_ORIGINS`.

## Verify the deployment

Check the backend health response:

```sh
curl -i https://YOUR_BACKEND_ORIGIN/api/v1/health
```

It should return HTTP 200 with `Content-Type: application/json` and a JSON
body whose `status` is `ok`. From a browser on GitHub Pages, inspect
`POST https://YOUR_BACKEND_ORIGIN/api/v1/auth/login`: an authentication
failure should be a JSON 401; a valid login should be JSON 200 with a
`Set-Cookie` session. Never place a real password in shared logs or reports.
