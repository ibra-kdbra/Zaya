# Private repository (Zaya Pro) bootstrap

These files are **not used by this public repository**. They are the reference copies of what
lives in the private `ibra-kdbra/zaya-pro` repository (already created and bootstrapped).

```
zaya-pro/                      (private, single source of truth)
├── <everything from this public repo>
├── pro/                       🔒 premium plugins, loaded via lib/js/pro-features/index.js
│   ├── index.js               registers plugins with window.ZayaPlugins
│   ├── auth/  watermark/  analytics/  branding/  narration/  pdf-tools/
├── docs/                      🔒 internal docs (already git-ignored here)
└── .github/workflows/sync_public.yml   🔒 copies the public subset to ibra-kdbra/Zaya
```

Remaining steps (see the README in `zaya-pro` for the exact commands):

1. Push this repository's history into `zaya-pro` (`git remote add pro …`, merge the bootstrap commit, push to `main`).
2. Add a fine-grained PAT named `PUBLIC_SYNC_TOKEN` with *contents: write* on `ibra-kdbra/Zaya` only.
3. Point Vercel at `zaya-pro` for the hosted (Pro) build; the public repo stays the OSS build.
4. From then on **only commit in `zaya-pro`**. The sync action updates the public `main`.

`.publicignore` lists what never leaves the private repo.
