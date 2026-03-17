// Copy to `app/config.js` and fill in values.
// IMPORTANT: do not put secrets here. Only public config.

export const APP_CONFIG = {
  title: "Daily Report",
  timezone: "Europe/Moscow",

  github: {
    owner: "YOUR_GITHUB_USERNAME_OR_ORG",
    repo: "YOUR_REPO_NAME",
    branch: "main",

    // Optional OAuth (may not work in some browsers due to CORS on token exchange).
    // If OAuth doesn't work, you can use a fine-grained PAT instead.
    oauth: {
      enabled: false,
      clientId: "YOUR_OAUTH_CLIENT_ID",
      redirectPath: "/auth.html",
      scopes: ["repo"], // private repo needs repo; public repo can use public_repo
    },
  },

  giscus: {
    enabled: false,
    repo: "OWNER/REPO",
    repoId: "",
    category: "General",
    categoryId: "",
    theme: "transparent_dark",
    lang: "ru",
  },
};

