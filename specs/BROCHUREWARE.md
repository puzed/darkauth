# DarkAuth Brochureware — Content & Structure Spec

> **Status:** Content scaffold / brief. This document defines *what* the marketing site
> says and *how it is organized* — not the visual design. A separate design/build pass
> (`packages/brochureware`, Vite + React) will turn this into the actual site.
>
> **Goal of the site:** make it instantly clear what DarkAuth is, let visitors get the
> "elevator pitch" in 10 seconds, and then let them *explore deeper into the exact topics
> they care about* via sub-pages — without dumping everything on one page.

---

## 1. Positioning & Core Message

### 1.1 What DarkAuth is (one sentence)
> **DarkAuth is a self-hosted, open-source authentication server with OpenID Connect — built so the server never sees your users' passwords, and (optionally) never sees the keys that encrypt their data.**

### 1.2 The elevator pitch (≈40 words, for the hero subhead)
> Drop-in OpenID Connect for your apps, with a zero-knowledge core. Passwords are verified using OPAQUE, so they never reach the server. And with optional zero-knowledge key delivery, your app can offer true end-to-end encryption — keys are derived on the user's device and never touch the database.

### 1.3 The 3 pillars (the "why DarkAuth")
These are the three ideas every page should reinforce. Use them as the homepage's primary feature triad.

| Pillar | Headline | One-liner |
|---|---|---|
| **Zero-knowledge by design** | Your server can't leak what it never had | OPAQUE means passwords never hit the wire or the database. Optional DRK delivery means data-encryption keys never do either. |
| **Standards-compatible** | Works with everything that speaks OIDC | Standard OAuth 2.0 / OpenID Connect. PKCE, refresh tokens, discovery, JWKS. No proprietary SDK required to log a user in. |
| **Yours to run** | Open source, self-hosted, no SaaS | One Docker image. Postgres or zero-dependency embedded database. No seats, no per-MAU pricing, no vendor lock-in. AGPL-3.0. |

### 1.4 Who it's for (audience segments — drive "Use Cases" page)
- **Builders of privacy-first / E2EE apps** — note apps, password managers, health, journaling, secure messaging. They need a login *and* a key-management primitive.
- **Teams that want to self-host auth** — don't want to send user identity data to a third-party IdP, or don't want per-MAU SaaS pricing.
- **Security-conscious orgs** — want OPAQUE password handling and a documented threat model, not "we hash with bcrypt, trust us."
- **Developers who just need OIDC** — want a clean, standards-compliant provider they can stand up in minutes.

### 1.5 What makes it different (the wedge)
Most "auth" products stop at *identity* (who is this user). DarkAuth also gives you a *cryptographic key primitive* (the Data Root Key) that your app can use to encrypt user data end-to-end — delivered through the same login flow, without the server ever being able to read it. **Identity + key custody, in one login.**

### 1.6 Explicit non-claims / honesty (build trust, avoid overstating)
The site must be precise — security people are the audience and overclaiming destroys credibility. Carry these caveats into the Security pages:
- Zero-knowledge holds during **honest frontend operation**. A compromised browser, malicious script on a trusted origin (XSS), or a malicious app can still read keys in the browser. Say this plainly.
- Email password reset restores **account access**, not encrypted data tied to the old password.
- v1 is **single-tenant** at the key-derivation layer (organizations exist for RBAC; multi-tenant key separation is future work).
- No certifications are claimed. Auditing is community-driven — the code and specs are public.

---

## 2. Brand & Visual Direction (for the design/build pass)

> Pull the brand from the admin dashboard — that *is* the brand. Dark, sharp, technical,
> confident. Not playful, not enterprise-bland. Think "developer security tool," not "SaaS startup."

### 2.1 Colors (sourced from `packages/admin-ui/src/index.css`)
| Token | HSL | Hex (approx) | Use |
|---|---|---|---|
| **Primary** | `270 100% 40%` | `#6600CC` | Brand purple. CTAs, links, logo. Matches the icon fill exactly. |
| **Secondary** | `43 90% 50%` | `#F2B10D` | Amber/gold accent. Highlights, secondary CTAs, "pro" touches. |
| **Dark background** | `270 13% 15%` | `#26212B` | Primary dark canvas (purple-tinted charcoal). |
| **Card (dark)** | `0 0% 8%` | `#141414` | Cards / panels on dark. |
| **Success** | `142 71% 45%` | `#1FB85A` | Status "online", positive states. |
| **Foreground (dark)** | `210 40% 98%` | `#F7FAFC` | Text on dark. |
| **Border (dark)** | `217 33% 18%` | `#1E2733` | Hairlines, dividers. |

- **Default to a dark theme** for the marketing site (the product's signature look). A light variant is optional.
- Radius: `0.5rem` (matches `--radius`).
- Font: system stack (`-apple-system, "Segoe UI", Roboto, Helvetica Neue, Arial`). Optional: pair with a sharper display font for headlines, but keep body in a clean sans. A mono face for code/keys/crypto callouts.

### 2.2 Logo & assets
- **Logo / icon:** `logos/icon.svg` — purple fingerprint-lock mark (`#6600CC`). Use as favicon, header mark, and a large background/hero motif.
- **Hero screenshot:** `logos/hero.png` — admin dashboard composite (dashboard + login). Use in the homepage hero.
- **Live product screenshots:** the admin UI (dark, purple sidebar: Dashboard, Users, Organizations, Roles, Permissions, Clients, Federation, SCIM Tokens, Signing Keys, Admin Users, Audit Logs, Branding, Email Templates, Settings) and the user portal. These can be re-captured for feature pages.
- A screenshot collector exists historically (`scripts/collect-screenshots.js`) — design pass may regenerate fresh shots.

### 2.3 Tone of voice
- **Clear over clever.** The #1 risk (per the brief) is being confusing. Lead every page with a plain-English statement of what the thing is and why it matters.
- **Technical but not gatekeeping.** Each deep concept gets an "ELI5" framing first, then the precise version. (The security whitepaper already does this — reuse the pattern.)
- **Honest.** State the trust boundary. Security readers reward candor.
- **Concise.** Short sentences. No marketing fluff like "revolutionary" or "next-gen."

---

## 3. Information Architecture (site map)

Progressive disclosure is the organizing principle: **Home → topic overview → deep dive.**
Visitors should never be forced through a wall of text; they pick a thread and pull it.

```
/                         Home (elevator pitch + hero + pillars + feature teaser + social proof + CTA)
│
├── /features             Features overview (the catalog — short cards, each links to a deep dive)
│   ├── /features/zero-knowledge-passwords      OPAQUE explained
│   ├── /features/zero-knowledge-keys           DRK / end-to-end encryption delivery
│   ├── /features/oidc                          OIDC / OAuth 2.0 compatibility
│   ├── /features/mfa                            TOTP MFA + backup codes
│   ├── /features/organizations-rbac            Orgs, roles, permissions
│   ├── /features/federation                    Upstream SSO (OIDC / SAML)
│   ├── /features/scim                           SCIM 2.0 provisioning
│   ├── /features/branding                       White-label / theming
│   └── /features/admin                          Admin console, audit logs, key management
│
├── /how-it-works         The flow, told as a story (auth → keys → your app). Progressive depth.
│
├── /security             Security overview (trust model, threat model, "what we can't see")
│   ├── /security/whitepaper        Full v1 Security Whitepaper (long-form / rendered)
│   └── /security/zero-knowledge    The ZK extension spec, explained
│
├── /use-cases            Who uses it & why (segments from §1.4, with concrete scenarios)
│
├── /developers           Developer hub (quickstart, SDK, OIDC endpoints, demo app)
│   ├── /developers/quickstart      Run it in 5 minutes (Docker)
│   ├── /developers/sdk             @darkauth/client reference + integration
│   └── /developers/oidc            Endpoints, discovery, flows
│
├── /self-host            Deployment / ops (Docker, Postgres vs PGLite, config, KEK)
│
├── /open-source          License, "no SaaS / free forever", GitHub, how to contribute/audit
│
└── /docs                 (Link out to /docs or hosted documentation. Not authored here.)
```

> Footer also links to: GitHub, Docker image (`ghcr.io/puzed/darkauth`), Changelog
> (`release.darkauth.com/changelog.json`), License, Security contact.

---

## 4. Global Elements

### 4.1 Header / nav
- Left: logo mark + "DarkAuth" wordmark.
- Center/right: **Features · How it works · Security · Developers · Open Source**.
- Right CTA buttons: **"Get Started"** (→ Quickstart) and a **GitHub** link (star count is nice-to-have).
- Sticky, dark, thin. Mobile: collapse to a menu.

### 4.2 Footer
- Columns: **Product** (Features, How it works, Security, Use cases) · **Developers** (Quickstart, SDK, OIDC, Demo app) · **Project** (Open source, License, Changelog, GitHub) · **Resources** (Whitepaper, Docs, Security contact).
- Bottom line: "DarkAuth is open source under AGPL-3.0. Self-host it forever, free." + Docker pull command.

### 4.3 Recurring CTAs (use across pages)
- Primary: **"Run it with Docker"** → shows `docker run -d -p 9080:9080 -p 9081:9081 ghcr.io/puzed/darkauth:latest`.
- Secondary: **"Read the whitepaper"** / **"Browse the source"**.
- Avoid a "Sign up" / "Start free trial" CTA — there is no SaaS. The conversion is *self-host* or *star/read*.

---

## 5. Page-by-Page Content Briefs

> Each brief lists: purpose, the headline/subhead, the sections, and what it links to.
> Copy here is *direction*, not final wording — tighten in the build.

### 5.1 Home (`/`)
**Purpose:** Answer "what is this?" in 10 seconds; tease the depth; route people to their thread.

**Hero**
- H1: *Authentication that can't leak what it never had.*
- Sub: the elevator pitch (§1.2).
- CTAs: "Run it with Docker" (primary) · "How it works" (secondary).
- Visual: `logos/hero.png` (admin dashboard + login), framed on the dark canvas with the purple glow / logo motif.

**Section — The 3 pillars** (§1.3 as three cards with icons).

**Section — "What you can build"** (teaser of use cases; 3–4 cards → /use-cases).

**Section — Feature teaser grid** (6–8 of the strongest features as compact cards, each linking into `/features/*`). Don't explain them fully here — that's the point.

**Section — How it works (compressed)** — a 3-step visual (1. User proves password with OPAQUE → 2. Device derives keys, server stores only ciphertext → 3. Your app gets identity + an optional sealed key). CTA → /how-it-works.

**Section — For developers** — a short code/Docker snippet + "OIDC-compatible, SDK optional." CTA → /developers.

**Section — Trust / honesty strip** — "We document exactly what we can and can't protect." CTA → /security.

**Section — Open source** — "No SaaS. No seats. No per-user pricing. AGPL-3.0." CTA → GitHub.

**Final CTA band** — Docker command + GitHub.

---

### 5.2 Features overview (`/features`)
**Purpose:** The catalog. Short, scannable cards — each a doorway to a deep dive.
**Headline:** *Everything you need to authenticate users — and protect their data.*
**Layout:** grouped cards. Each card = icon + name + one-line value + "Learn more →".

**Card list (with the one-liners):**
1. **Zero-knowledge passwords (OPAQUE)** — Passwords are verified without ever being sent to the server. → `/features/zero-knowledge-passwords`
2. **Zero-knowledge key delivery (DRK)** — Give your app an encryption key the server can't read. → `/features/zero-knowledge-keys`
3. **OpenID Connect** — Standard OAuth 2.0 / OIDC with PKCE, discovery, JWKS. → `/features/oidc`
4. **Multi-factor auth (TOTP)** — Authenticator-app MFA with backup codes and per-org enforcement. → `/features/mfa`
5. **Organizations & RBAC** — Multi-org membership, roles, and fine-grained permissions in tokens. → `/features/organizations-rbac`
6. **Federation (upstream SSO)** — Let users sign in through upstream OIDC / SAML providers. → `/features/federation`
7. **SCIM 2.0 provisioning** — Provision and deprovision users/groups from your IdP. → `/features/scim`
8. **White-label branding** — Match the login and portal to your brand — colors, logo, copy, custom CSS. → `/features/branding`
9. **Admin console & audit** — Manage users, clients, keys, and a full audit trail. → `/features/admin`

---

### 5.3 Feature deep-dives (`/features/*`)
Each follows the same template so they feel coherent and stay easy to read:

```
- One-line definition (plain English)
- "Why it matters" (2–3 sentences, the user/business value)
- "How it works" (ELI5 first, then the precise mechanism)
- Screenshot or diagram where it helps
- Key details / specs (bullet list — the real facts)
- Caveats / honesty (where relevant)
- "Related" links (to adjacent features + relevant Security/Developer pages)
```

Content per page:

**`/features/zero-knowledge-passwords` — OPAQUE**
- Def: The server proves you know your password without ever receiving it.
- Why: Database breaches and insider access can't reveal passwords — there's nothing to steal. No "we hash with X" hand-waving; the password never arrives.
- How: OPAQUE (RFC 9380), P-256 ciphersuite. The server stores an opaque verifier it cannot reverse. The client derives a stable `export_key` per (user, password) used to bootstrap key derivation. Enumeration resistance + rate limits on login.
- Details: separate admin/user OPAQUE flows; password *change* without losing keys (re-wrap the DRK under the new key — no data re-encryption); SMTP-gated email reset with single-use hashed tokens + session revocation.
- Related: zero-knowledge-keys, security/whitepaper.

**`/features/zero-knowledge-keys` — Data Root Key delivery**
- Def: A 32-byte encryption key, derived on the user's device, handed to your app through the login — without the server ever being able to read it.
- Why: This is what lets you build genuinely end-to-end encrypted apps on top of a normal-feeling login. The user logs in once; your app gets identity *and* a usable encryption key.
- How (ELI5): Your device makes a secret key from your password and uses it to lock your data key. The server keeps only the locked box. When you log in, the key is delivered to the app in a sealed envelope that doesn't route through the server.
- How (precise): Client derives `MK → KW` via HKDF from `export_key`; a random DRK is wrapped with `KW` (AEAD, AAD=sub); server stores **only** `WRAPPED_DRK`. For ZK-enabled clients, the app supplies an ephemeral P-256 public key (`zk_pub`); the browser builds `drk_jwe = ECDH-ES + A256GCM(DRK, zk_pub)` and delivers it via the **URL fragment**. The server stores/returns only `sha256(drk_jwe)` (`zk_drk_hash`) so the app can verify integrity. The JWE itself never hits the server.
- Caveat: opt-in per client (`zk_delivery='fragment-jwe'`). Default custody is memory-only in the app. ZK holds during honest frontend operation — see Security.
- Related: how-it-works, security/zero-knowledge, developers/sdk (the demo app DarkNotes is built on this).

**`/features/oidc` — OpenID Connect**
- Def: A standards-compliant OAuth 2.0 / OpenID Connect provider.
- Why: Anything that speaks OIDC can integrate — no proprietary login SDK required. EdDSA-signed ID tokens, discovery, JWKS.
- Details: `/.well-known/openid-configuration` + `jwks.json`; Authorization Code + PKCE (S256 required for public clients); confidential clients (`client_secret_basic`); refresh tokens (hashed at rest, single-use rotation, client-bound); `userinfo`, `introspect`, `revoke`. Short-lived single-use auth codes (≤60s, atomic redemption). Optional `permissions`/`groups`/org claims in ID tokens.
- Related: developers/oidc, organizations-rbac.

**`/features/mfa` — TOTP MFA**
- Def: Authenticator-app two-factor for users and admins.
- Details: 6-digit TOTP over 30s windows; QR provisioning; 8 Argon2-hashed backup codes; anti-replay (last-timestep tracking); rate limits + lockout; ±1 window skew tolerance; per-organization `force_otp` enforcement; secrets encrypted at rest with KEK; MFA reflected in token `amr`/`acr`.
- Related: organizations-rbac, security.

**`/features/organizations-rbac` — Organizations, roles & permissions**
- Def: Multi-tenant org model with role-based access control resolved in org context.
- Details: organizations (slug, name, `force_otp`); memberships (active/invited/suspended); reusable roles; fine-grained permissions; users in multiple orgs with different roles; ID tokens carry `org_id`, `org_slug`, `roles`, `permissions` (direct + group-derived union). Org switcher in the user portal.
- Caveat: org model is for RBAC; v1 key derivation is single-tenant.
- Related: oidc, admin.

**`/features/federation` — Upstream SSO**
- Def: Let users sign in through an upstream OIDC or SAML 2.0 provider.
- Details: configurable upstream connections (issuer/entity ID, client ID + encrypted secret, JWKS/metadata, enable toggle); claim mapping; account-linking policy; domain routing (route by email domain). Federation authenticates identity only — ZK clients still require a separate key unlock before DRK delivery.
- Related: scim, security.

**`/features/scim` — SCIM 2.0 provisioning**
- Def: Provision and deprovision users/groups from your identity provider.
- Details: SCIM v2 `Users`/`Groups`, `ServiceProviderConfig`, `ResourceTypes`, `Schemas`; lifecycle (active/suspended/deactivated); deactivation revokes sessions + refresh tokens; scoped provisioning tokens with expiry; external-ID mapping. Note: SCIM provisions accounts — it is **not** an auth method; provisioned users still authenticate (password / federation) and may need first-login key setup.
- Related: federation, organizations-rbac.

**`/features/branding` — White-label**
- Def: Make the login and user portal yours.
- Details: brand title/tagline, logo, favicon; full color palette incl. gradients + semantic colors; typography (family, size, weights); all UI copy (titles, buttons, links, errors, authorization/scope text); sanitized custom CSS; live preview in the admin panel; served via `/config.js` with sensible caching. Stored in the database.
- Related: admin.

**`/features/admin` — Admin console, audit & key management**
- Def: One console to run the whole system.
- Details: Dashboard (users, OAuth clients, ZK-enabled clients, signing keys, system health, changelog); Users; Organizations/Roles/Permissions; Clients; Federation; SCIM Tokens; Signing Keys (JWKS rotation); Admin Users (separate cohort); Audit Logs (list/detail/export); Branding; Email Templates; Settings. Most config lives in Postgres; private keys/client secrets encrypted at rest with a KEK.
- Related: self-host, security.

---

### 5.4 How it works (`/how-it-works`)
**Purpose:** Tell the end-to-end story with progressive depth so a non-cryptographer gets it, and an engineer can drill in.
**Headline:** *One login. Verified identity, and an encryption key the server can't read.*

**Structure (scrollytelling / stepped):**
1. **Prove the password (without sending it).** OPAQUE: ELI5 ("you prove you know it, like answering a challenge, without ever handing it over"), then the verifier/`export_key` detail. Diagram of the key schedule (`export_key → MK → KW/KDerive → WRAPPED_DRK`).
2. **Keep the keys on the device.** Why the server only ever stores ciphertext. What "wrapped DRK" means.
3. **Hand the app a sealed key.** The fragment-JWE delivery, the `zk_drk_hash` integrity check, why the fragment never reaches the server.
4. **Use standard OIDC for everything else.** ID token, refresh, claims.
5. **Where the trust boundary is.** Honest section: this protects against DB exfiltration, insider reads, redirect tampering — but not a compromised browser / XSS / malicious app. Link to Security.

Include both Mermaid sequence diagrams (standard code flow + ZK fragment flow) from the whitepaper, rendered cleanly.

---

### 5.5 Security (`/security`)
**Purpose:** Earn the trust of the most skeptical reader. This is a differentiator — lean in.
**Headline:** *We tell you exactly what we can — and can't — protect.*

**Sections:**
- **What the server never stores** — passwords, plaintext DRK, DRK JWE, derived keys (MK/KW/KDerive), `export_key`. Contrast with what it *does* store (opaque verifier, wrapped DRK ciphertext, hashes).
- **Cryptographic primitives** — OPAQUE (RFC 9380, P-256), HKDF-SHA256 schedule, AES-256-GCM AEAD, ECDH-ES + A256GCM JWE, EdDSA (Ed25519) ID tokens, Argon2id KEK, PKCE S256.
- **Threat model** — table of attacks → mitigations (DB exfiltration, insider reads, redirect tampering, weak-key injection, token endpoint abuse) and an explicit **out-of-scope** list (malicious frontend/XSS, compromised device/browser/extensions, broken TLS, malicious RP app).
- **Operational security** — encrypted keys at rest, rate limiting, audit logs, key rotation, logging restrictions (never log secrets), KEK/install model.
- **Privacy posture** — data minimization; explicit "no certifications claimed; auditing is community-driven."
- CTAs: **Read the full whitepaper** → `/security/whitepaper`; **Understand the ZK extension** → `/security/zero-knowledge`; **Read the source on GitHub**.

**`/security/whitepaper`** — render the full `specs/0_SECURITY_WHITEPAPER.md` as a long-form, well-typeset page (TOC sidebar, anchored sections, diagrams). Offer a PDF/print view.

**`/security/zero-knowledge`** — explain `specs/0_OIDC_ZK_EXTENSION.md`: how `zk_pub` is supplied/encoded, fragment delivery, hash binding, per-client opt-in, validation rules.

---

### 5.6 Use cases (`/use-cases`)
**Purpose:** Help visitors self-identify. Concrete scenarios beat abstractions.
**Headline:** *Built for apps where privacy isn't optional.*
**Cards / sections (one per segment from §1.4), each with a concrete scenario:**
- **End-to-end encrypted apps** — "A notes app where the server can't read the notes." Reference the bundled **DarkNotes** demo (zero-knowledge encrypted notes: OPAQUE login, per-note DEKs derived from the DRK, ECDH sharing).
- **Self-hosted identity for your product** — replace a SaaS IdP; keep user data on infrastructure you control; no per-MAU bill.
- **Security-first organizations** — documented threat model, OPAQUE, MFA, audit logs.
- **"Just give me clean OIDC"** — minimal, standards-compliant provider you can run in minutes.

---

### 5.7 Developers (`/developers`)
**Purpose:** Convert engineers. Show how fast and how standard it is.
**Headline:** *Standards-first. SDK optional.*

**Sections / sub-pages:**
- **`/developers/quickstart`** — "Running in 5 minutes": Docker one-liner, visit `:9081` installer (DB choice, KEK passphrase, admin user), register a client, point your app at discovery. Show the dev mode too (`npm run dev`, Vite servers).
- **`/developers/sdk`** — `@darkauth/client` reference. Show the integration shape: `setConfig` → `initiateLogin` → `handleCallback` → `getCurrentUser` / `refreshSession` / `logout`. Then the crypto layer for ZK apps: DRK in the returned session, `deriveDek`/`resolveDek`, `aeadEncrypt`/`aeadDecrypt`, `encryptNote`/`decryptNote`, key wrapping, hooks. Make clear: **non-ZK apps don't need any of the crypto** — plain OIDC works with any library.
- **`/developers/oidc`** — endpoint reference (discovery, JWKS, authorize, token, userinfo, introspect, revoke, OPAQUE, DRK), flow descriptions, the two default demo clients (public PKCE + ZK, and confidential), code TTL/PKCE constraints.
- Link to the **demo app** source as a worked, real example.

---

### 5.8 Self-host / Deploy (`/self-host`)
**Purpose:** Show that running it is genuinely easy, and explain the choices.
**Headline:** *One image. Your infrastructure. No external dependencies required.*
**Sections:**
- **Docker** — `docker run … ghcr.io/puzed/darkauth:latest`; ports 9080 (user/OIDC) + 9081 (admin); first-run installer (single-use token).
- **Database: Postgres or PGLite** — remote PostgreSQL 15+ for production, or embedded **PGLite** for zero-dependency / trials. Trade-offs.
- **Configuration** — `config.yaml` holds only instance specifics (ports, DB URI, **KEK passphrase**); everything else lives in the DB and is editable in the admin UI. `publicOrigin`/`issuer`/`rpId`.
- **Security at rest** — KEK from Argon2id passphrase encrypts private JWKs + client secrets; guidance (HTTPS, secure cookies, strong passphrase, trusted origins, `allowed_zk_origins`).
- **Two-port architecture** — why user and admin are separated.
- **Changelog / updates** — `release.darkauth.com/changelog.json`.

---

### 5.9 Open source (`/open-source`)
**Purpose:** Make the "free forever, no SaaS" story explicit and reinforce trust via openness.
**Headline:** *Free, forever. Because it's yours.*
**Content:**
- No paid plan, no subscription, no cloud service, no seats, no per-MAU pricing.
- **AGPL-3.0** for core; `demo-app` and `darkauth-client` are **MIT**; `opaque-ts` is **BSD-3-Clause**. State this clearly (it matters for adopters).
- "Audit it yourself" — the code and the security specs are public; that *is* the audit story.
- How to contribute, file issues, and report security concerns. Link to GitHub.

---

## 6. Progressive-Disclosure Model (the "explore" mechanic)

This is the brief's core requirement: *don't dump everything; let people expand into what interests them.* Implement disclosure at three levels:

1. **Site level** — Home teases; topic pages summarize; deep-dives detail. Every summary card ends in a clear "Learn more →".
2. **Page level** — Within deep-dives and Security, use the **ELI5 → precise** pattern. Default to the plain explanation; let the reader expand the technical version (accordion / "show the crypto" toggle).
3. **Cross-linking** — Every page has a "Related" block so a curious reader can follow their thread sideways (e.g., zero-knowledge-keys → how-it-works → security/zero-knowledge → developers/sdk).

Each deep-dive should be readable standalone (someone may land from search) and should *not* require having read the homepage.

---

## 7. Feature Catalog (master list — single source of truth)

Compact reference the builder can turn into cards/badges. (Detail lives in §5.3.)

- Zero-knowledge password auth (OPAQUE, RFC 9380, P-256)
- Optional zero-knowledge DRK delivery (fragment JWE, ECDH-ES + A256GCM, hash-bound)
- OpenID Connect / OAuth 2.0 (discovery, JWKS, PKCE S256, EdDSA ID tokens)
- Refresh tokens (hashed at rest, single-use rotation, client-bound)
- UserInfo / Introspection / Revocation endpoints
- TOTP MFA (backup codes, anti-replay, rate limits, per-org enforcement) — users *and* admins
- Email password reset (SMTP-gated, anti-enumeration, hashed single-use tokens, session revocation)
- Email verification (signup + email-change flows, editable templates)
- Password change **without key loss** (DRK re-wrapped, no data re-encryption)
- Organizations (multi-org membership, per-org OTP policy, org switcher)
- RBAC (roles + fine-grained permissions, resolved in org context, surfaced in tokens)
- Federation / upstream SSO (OIDC + SAML 2.0, claim mapping, account linking, domain routing)
- SCIM 2.0 provisioning (Users/Groups, lifecycle, scoped tokens, external-ID mapping)
- White-label branding (colors, logo, typography, all copy, custom CSS, live preview)
- Admin console (users, clients, keys, settings) + full audit log (export)
- Signing-key management & rotation (JWKS, EdDSA/Ed25519)
- Encryption at rest (Argon2id-derived KEK protects private keys + client secrets)
- Two-port architecture (user/OIDC :9080, admin :9081) + first-run web installer
- Deployment: single Docker image; Postgres **or** embedded PGLite; DB-backed config
- Client SDK `@darkauth/client` (OIDC + optional ZK crypto helpers)
- Bundled demo app (DarkNotes — E2EE notes) as a worked reference
- Open source: AGPL-3.0 core (MIT SDK/demo, BSD-3 opaque-ts), self-hosted, no SaaS

---

## 8. Glossary (reuse on the site, e.g. hover-cards / a /glossary or inline tooltips)

- **OPAQUE** — Password-authenticated key exchange (RFC 9380). The server stores an opaque verifier and never receives the password.
- **DRK (Data Root Key)** — A per-user 32-byte symmetric key for encrypting application data. Generated and held client-side; server stores only the wrapped (encrypted) form.
- **`export_key`** — A stable secret the client derives from the password via OPAQUE; the root of the client key schedule.
- **KW / MK / KDerive** — Keys derived from `export_key` via HKDF; **KW** wraps the DRK.
- **JWE** — JSON Web Encryption. Here: compact ECDH-ES (P-256) + A256GCM, used to seal the DRK for the app.
- **`zk_pub` / `zk_drk_hash`** — The app's ephemeral public key supplied at authorize; the server-stored hash of the delivered DRK JWE used for integrity verification.
- **PKCE** — Proof Key for Code Exchange; S256 required for public clients.
- **KEK** — Key Encryption Key, derived from a passphrase via Argon2id, used to encrypt private keys/secrets at rest.
- **OIDC** — OpenID Connect, the identity layer on top of OAuth 2.0.
- **RBAC** — Role-Based Access Control, resolved per organization.

---

## 9. Content Guidelines (for whoever writes final copy)

- **Lead with the plain answer.** First sentence of every page = what it is, in plain English.
- **One idea per section.** No walls of text. Break with diagrams, code, screenshots.
- **Show, then explain.** Screenshot/diagram first, prose second, where possible.
- **Never overclaim.** If something only holds under a condition, say the condition.
- **Use the brand voice** (§2.3): clear, technical, honest, concise.
- **Every page ends with a "next step"** — a related link or a CTA. No dead ends.
- **Code is content.** Real commands (`docker run …`) and real endpoints build credibility.

---

## 10. Source Material (where this content comes from — for fact-checking the build)

- `README.md` — features, endpoints, quickstart, deployment, licensing.
- `specs/0_SECURITY_WHITEPAPER.md` — security model, primitives, threat model, flows, glossary.
- `specs/0_OIDC_ZK_EXTENSION.md` — the ZK extension details.
- `specs/2_CORE.md` — core technical spec (endpoints, federation, SCIM, sessions).
- `specs/RBAC.md`, `specs/9_OTP.md`, `specs/PASSWORD_RESET.md`, `specs/EMAIL_VERIFICATION.md`, `specs/4_CUSTOM_BRANDING.md`, `specs/USER_KEY_MANAGEMENT.md`, `specs/ORG_SELECTION.md` — per-feature detail.
- `packages/darkauth-client/README.md` — SDK API surface.
- `packages/demo-app/README.md` — DarkNotes demo.
- `packages/admin-ui/src/components/app-sidebar.tsx` — admin navigation (feature surface).
- `packages/admin-ui/src/index.css` — brand color tokens.
- `logos/icon.svg`, `logos/hero.png` — brand assets.

> When in doubt, the specs are authoritative over this brief. If a fact here conflicts
> with the code/specs, fix this document.

---

## 11. Build Task Checklist

Broken-down work to take this brief to a shipped site at `packages/brochureware`.

### 11.1 Project scaffold
- [ ] Create `packages/brochureware` as a Vite + React + TypeScript app, added to the npm workspaces.
- [ ] Add to root `package.json` workspaces and wire `dev` / `build` / `preview` scripts.
- [ ] Choose routing (file-based or React Router) for the site map in §3.
- [ ] Set up Biome (match the repo's lint/format config used by `admin-ui`).
- [ ] Add a static-export / SSG path (or prerender) so pages are crawlable for SEO.
- [ ] Configure base meta (title, description, OG/Twitter cards, favicon from `logos/icon.svg`).

### 11.2 Design system
- [ ] Port brand tokens from §2.1 into CSS variables (primary `#6600CC`, secondary `#F2B10D`, dark canvas, etc.).
- [ ] Default dark theme; decide whether to ship a light variant.
- [ ] Typography scale + optional display font; mono face for code/crypto callouts.
- [ ] Reusable primitives: Button (primary/secondary), Card, Badge, Section, CodeBlock, Callout/ELI5, Accordion (for progressive disclosure), Diagram wrapper (Mermaid rendering).
- [ ] Copy logo/hero assets into the package (`logos/icon.svg`, `logos/hero.png`); add favicon set.
- [ ] Responsive breakpoints + mobile nav.

### 11.3 Global layout
- [ ] Header / sticky nav (§4.1) with Get Started + GitHub CTAs.
- [ ] Footer (§4.2) with all four column groups + Docker pull line.
- [ ] Recurring CTA components (§4.3): "Run it with Docker" block, "Read the whitepaper".
- [ ] 404 page + skip-to-content / a11y baseline.

### 11.4 Pages — core
- [ ] Home (`/`) — hero, 3 pillars, what-you-can-build, feature teaser grid, compressed how-it-works, developer strip, trust strip, open-source strip, final CTA (§5.1).
- [ ] Features overview (`/features`) — grouped card catalog (§5.2).
- [ ] How it works (`/how-it-works`) — 5-step stepped/scrolly story + 2 Mermaid sequence diagrams + key-schedule diagram (§5.4).
- [ ] Use cases (`/use-cases`) — 4 segment scenarios incl. DarkNotes (§5.6).
- [ ] Self-host (`/self-host`) — Docker, Postgres vs PGLite, config, KEK, two-port (§5.8).
- [ ] Open source (`/open-source`) — no-SaaS story + license breakdown (§5.9).

### 11.5 Pages — feature deep-dives (§5.3 template)
- [ ] `/features/zero-knowledge-passwords` (OPAQUE)
- [ ] `/features/zero-knowledge-keys` (DRK delivery)
- [ ] `/features/oidc`
- [ ] `/features/mfa`
- [ ] `/features/organizations-rbac`
- [ ] `/features/federation`
- [ ] `/features/scim`
- [ ] `/features/branding`
- [ ] `/features/admin`

### 11.6 Pages — security & developers
- [ ] Security overview (`/security`) — what-we-never-store, primitives, threat-model table, op-sec, privacy (§5.5).
- [ ] `/security/whitepaper` — render `specs/0_SECURITY_WHITEPAPER.md` long-form with TOC + anchors + print/PDF view.
- [ ] `/security/zero-knowledge` — explain `specs/0_OIDC_ZK_EXTENSION.md`.
- [ ] Developers hub (`/developers`) (§5.7).
- [ ] `/developers/quickstart` — Docker + installer walkthrough + dev mode.
- [ ] `/developers/sdk` — `@darkauth/client` integration shape + ZK crypto helpers.
- [ ] `/developers/oidc` — endpoint reference + flows + default demo clients.

### 11.7 Progressive-disclosure mechanics (§6)
- [ ] ELI5 → precise accordion/toggle pattern on deep-dives and security.
- [ ] "Related" cross-link block component on every deep-dive.
- [ ] "Learn more →" affordance standardized on all summary cards.
- [ ] Optional: glossary tooltips / hover-cards from §8 terms.

### 11.8 Content production
- [ ] Write final copy for each page from the briefs (don't ship placeholder lorem).
- [ ] Capture fresh, high-quality screenshots (admin + user portal) for feature pages.
- [ ] Produce/clean diagrams (key schedule + 2 sequence flows) styled to brand.
- [ ] Fact-check every technical claim against `specs/` and the README (§10); fix this doc on any drift.
- [ ] Verify license statements (AGPL-3.0 core, MIT SDK/demo, BSD-3 opaque-ts).

### 11.9 Quality, SEO & launch
- [ ] Per-page meta titles/descriptions + canonical URLs + sitemap.xml + robots.txt.
- [ ] OG images (consider a branded default + per-section variants).
- [ ] Accessibility pass (contrast on dark theme, focus states, landmarks, alt text).
- [ ] Performance pass (image optimization for `hero.png`/screenshots, Lighthouse).
- [ ] Cross-browser + mobile QA.
- [ ] Analytics (privacy-respecting) — decide whether to include.
- [ ] Deploy target + CI build (and `clearCache.js`/`deploy.js` equivalents if reused).
- [ ] Link-check all internal + external links (GitHub, Docker, changelog, docs).
