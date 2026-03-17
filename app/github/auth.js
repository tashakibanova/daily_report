import { APP_CONFIG } from "../config.js";
import { safeJsonParse } from "../utils.js";

const LS_TOKEN_KEY = "dr.github.token.v1";
const SS_PKCE_KEY = "dr.github.pkce.v1";

function randomString(len) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
}

async function sha256base64Url(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function getToken() {
  return sessionStorage.getItem(LS_TOKEN_KEY) || localStorage.getItem(LS_TOKEN_KEY) || "";
}

export function setToken(token, persist) {
  sessionStorage.removeItem(LS_TOKEN_KEY);
  localStorage.removeItem(LS_TOKEN_KEY);
  if (!token) return;
  (persist ? localStorage : sessionStorage).setItem(LS_TOKEN_KEY, token);
}

export async function startOAuthLogin() {
  const oauth = APP_CONFIG.github?.oauth;
  if (!oauth?.enabled) throw new Error("OAuth disabled in config");

  const codeVerifier = randomString(32);
  const codeChallenge = await sha256base64Url(codeVerifier);
  const state = randomString(16);

  sessionStorage.setItem(
    SS_PKCE_KEY,
    JSON.stringify({
      codeVerifier,
      state,
      createdAt: Date.now(),
    }),
  );

  const redirectUri = new URL(oauth.redirectPath, window.location.origin).toString();
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", oauth.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", (oauth.scopes || []).join(" "));
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  window.location.assign(authUrl.toString());
}

export async function exchangeOAuthCodeForToken({ code, state }) {
  const oauth = APP_CONFIG.github?.oauth;
  if (!oauth?.enabled) throw new Error("OAuth disabled in config");

  const raw = sessionStorage.getItem(SS_PKCE_KEY);
  const pkce = safeJsonParse(raw || "{}", null);
  if (!pkce?.codeVerifier) throw new Error("Missing PKCE verifier (open login from this device)");
  if (pkce.state !== state) throw new Error("State mismatch");

  const redirectUri = new URL(oauth.redirectPath, window.location.origin).toString();

  // NOTE: GitHub OAuth token endpoint historically had CORS ограничения.
  // We attempt the exchange; if browser blocks it, we'll ask user to use PAT.
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: oauth.clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce.codeVerifier,
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error_description || json.error);
  if (!json.access_token) throw new Error("No access_token returned");

  sessionStorage.removeItem(SS_PKCE_KEY);
  setToken(json.access_token, false);
  return json.access_token;
}

