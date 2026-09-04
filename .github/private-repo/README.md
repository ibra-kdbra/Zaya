# Private repository (Zaya Pro) bootstrap

These files are **not used by this public repository**. Copy them into the private
`zaya-pro` repository when you create it.

```
zaya-pro/                      (private, single source of truth)
├── <everything from this public repo>
├── pro/                       🔒 premium plugins, loaded via lib/js/pro-features/index.js
│   ├── index.js               registers plugins with window.ZayaPlugins
│   ├── auth/  watermark/  analytics/  branding/  narration/  pdf-tools/
├── docs/                      🔒 internal docs (already git-ignored here)
└── .github/workflows/sync_public.yml   🔒 copies the public subset to ibra-kdbra/Zaya
```

Steps:

1. Create the private repo: `gh repo create ibra-kdbra/zaya-pro --private`.
2. Push this repo's `main` into it, then add `pro/` and `lib/js/pro-features/index.js`.
3. Add `.github/workflows/sync_public.yml` (below) and a fine-grained PAT named `PUBLIC_SYNC_TOKEN`
   with *contents: write* on `ibra-kdbra/Zaya` only.
4. Point Vercel at `zaya-pro` for the hosted (Pro) build; the public repo stays the OSS build.
5. From then on **only commit in `zaya-pro`**. The sync action force-updates the public `main`.

`.publicignore` lists what never leaves the private repo.
