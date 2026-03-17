import { APP_CONFIG } from "../config.js";

function toBase64Utf8(str) {
  // btoa only supports Latin1; encode to UTF-8 first
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64Utf8(b64) {
  const bin = atob(b64.replaceAll("\n", ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export class GitHubClient {
  constructor({ token }) {
    this.token = token;
    this.owner = APP_CONFIG.github.owner;
    this.repo = APP_CONFIG.github.repo;
    this.branch = APP_CONFIG.github.branch || "main";
    this.baseUrl = "https://api.github.com";
  }

  headers(extra = {}) {
    const h = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...extra,
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async request(path, { method = "GET", body } = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });

    let json = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      json = await res.json();
    } else {
      const text = await res.text();
      json = { message: text };
    }

    if (!res.ok) {
      const msg = json?.message || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.details = json;
      throw err;
    }
    return json;
  }

  async getFile({ path }) {
    const apiPath = `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(this.branch)}`;

    const json = await this.request(apiPath, { method: "GET" });
    if (json.type !== "file") throw new Error("Not a file");
    return {
      sha: json.sha,
      contentText: fromBase64Utf8(json.content || ""),
    };
  }

  async putFile({ path, contentText, message, sha }) {
    const apiPath = `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;

    const body = {
      message: message || `Update ${path}`,
      content: toBase64Utf8(contentText),
      branch: this.branch,
    };
    if (sha) body.sha = sha;

    const json = await this.request(apiPath, { method: "PUT", body });
    return {
      sha: json.content?.sha || null,
      commitSha: json.commit?.sha || null,
    };
  }

  async getJson({ path, fallback = null }) {
    try {
      const { sha, contentText } = await this.getFile({ path });
      return { sha, value: JSON.parse(contentText) };
    } catch (e) {
      if (e?.status === 404) return { sha: null, value: fallback };
      throw e;
    }
  }

  async putJson({ path, value, message, sha }) {
    const contentText = JSON.stringify(value, null, 2) + "\n";
    return await this.putFile({ path, contentText, message, sha });
  }
}

