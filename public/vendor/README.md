# Self-hosted browser vendors

These files are reproducible copies of the exact, lockfile-pinned npm packages used by the SSR application:

Verified versions: htmx.org 2.0.10 and vanilla-tilt 1.8.1.

- `htmx.min.js` — `htmx.org@2.0.10`, 0BSD, <https://www.npmjs.com/package/htmx.org>
- `vanilla-tilt.min.js` — `vanilla-tilt@1.8.1`, MIT, <https://www.npmjs.com/package/vanilla-tilt>

SHA-256: `htmx.min.js` = `71EA67185BFA8C98C39D31717C6FCE5D852370FCDFD129DB4543774D3145C0DE`; `vanilla-tilt.min.js` = `DE6FA8D3F40DBAE2726A72F7D1AE46BB0588267AF05355BEF1D128F737F4A282`.

Regenerate them from the lockfile with:

```text
npm run vendor:copy
```

The application serves only these committed files from `/vendor`; it never exposes `node_modules` and never loads a runtime CDN.

The product-cover controller keeps the vendor version and option contract, but uses a small WAAPI adapter at runtime because Vanilla Tilt's inline style writes are incompatible with the application's strict `style-src 'self'` CSP. The adapter preserves the same bounded pointer-only tilt and keeps reduced-motion/coarse-pointer fallbacks intact.
