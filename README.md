# Helm

The web interface of **Helm**, the control panel for the Pelican game servers behind NEXT Roleplay and Coreline.
Live at **[breachato.github.io/helm](https://breachato.github.io/helm/)**, for authorized owners only.

- **Every server, live**: grouped by network, with state, CPU, RAM, disk and uptime, refreshed every few seconds.
- **Console**: colored log output, command input with history (↑ ↓).
- **Power**: start, restart, stop and kill, with a second click to confirm the destructive ones.
- **Players**: who is online and on which server, read from the proxy.
- **Shell**: on the owner's own PC, opens a root shell in the server's folder through the `helm-shell:` link.
- **Sign-in** with Discord or Telegram; the session lasts 12 hours.

This repository holds only the static site, served by GitHub Pages from the root.
It talks to [`breachato/helm-server`](https://github.com/breachato/helm-server) (private), whose address is in
[`config.js`](./config.js).

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page structure: boot screen, sign-in, panel |
| `style.css` | Design: dark, Geist and Geist Mono, lilac accent, white-dot cursor |
| `app.js` | Sign-in flow, polling, console rendering (ANSI colors), actions |
| `config.js` | Backend URL |
| `logo.svg`, `favicon.svg` | The helm-wheel mark |
| `.github/workflows/keepalive.yml` | Pings the backend every 5 minutes so the free Render instance stays awake |

## Notes

- The backend sleeps on Render's free plan after 15 minutes idle. The page shows "Risveglio del server…"
  while it wakes and retries on its own; every request has a timeout.
- Ad blockers that block `onrender.com` stop the panel from reaching the backend: the page says so.
  Allow `breachato.github.io` in the blocker.
- Static files are versioned in `index.html` (`?v=N`): bump the number when changing them, so browsers
  don't keep the cached copy.

## License

The source is visible because the site is public, but it is **not** open source:
proprietary, all rights reserved. See [`LICENSE.md`](./LICENSE.md); third-party components are listed in
[`NOTICE.md`](./NOTICE.md).
