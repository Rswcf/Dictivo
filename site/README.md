# site/

Single-page marketing site for Dictivo. Plain static HTML — no build step, no JS.

Deploy this directory to **Cloudflare Pages** with these settings:

- **Build command**: *(leave blank)*
- **Build output directory**: `site`
- **Root directory**: *(leave blank)*

See `docs/release/SETUP.md` Phase 4 for the full walkthrough.

## Files

| File | Purpose |
|---|---|
| `index.html` | Landing + pricing + FAQ |
| `privacy.html` | Privacy policy (template, customize before launch) |
| `eula.html` | End-user license agreement (template, customize before launch) |
| `latest.json` | Update manifest. Overwritten by the release CI workflow on every tag push. |
| `style.css` | Shared styles. |
| `_headers` | Cloudflare Pages security + caching headers. |

## Placeholders to replace before launch

Search the site for these strings:

```
REPLACE_WITH_LEMON_SQUEEZY_CHECKOUT_URL
REPLACE_WITH_LEMON_SQUEEZY_RENEWAL_URL
REPLACE_WITH_FREE_DOWNLOAD_URL
```

Replace with your real URLs once Lemon Squeezy is configured (Phase 3 in SETUP.md).
