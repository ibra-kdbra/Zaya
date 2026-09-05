# Security Policy

## Supported versions

Only the latest release on `main` (deployed at https://zaya.vercel.app) receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.
Use GitHub's private reporting form instead:
https://github.com/ibra-kdbra/Zaya/security/advisories/new

You will get an acknowledgement within 7 days. Once a fix is released the advisory is published with credit to the reporter (unless you prefer to stay anonymous).

## Scope

Zaya is a static, client-side application. Things we consider in scope:

- Script execution from a crafted PDF (pdf.js font/JS handling), URL parameters (`?pdf=`, `?page=`) or stored data (quotes, settings).
- Service-worker cache poisoning or persistence issues.
- Open-redirect / SSRF-style abuse of the remote PDF loader.

Out of scope: vulnerabilities in third-party hosting (Vercel), or in PDFs' own content that never leaves the pdf.js sandbox.

## Hardening already in place

- pdf.js is loaded with `isEvalSupported: false`, so embedded font programs are never run through `eval`.
- A Content-Security-Policy restricts scripts to same-origin plus the pinned CDNs used by the app.
- Remote PDF URLs are restricted to `http(s):` and `blob:` schemes and are validated before loading.
- User-supplied text (quotes, file names, URLs) is escaped before being inserted into the DOM.
