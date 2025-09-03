DarkAuth Client

Lightweight OIDC/OAuth client with optional DarkAuth ZK DRK delivery.

Install
- Workspace link: "file:../darkauth-client" or publish and npm install.

Basics
- setConfig({ issuer, clientId, redirectUri, zk })
- initiateLogin()
- handleCallback() → { idToken, drk, refreshToken? }
- getStoredSession()
- refreshSession()
- logout()
- getCurrentUser()

Crypto helpers
- deriveDek(drk, noteId)
- encryptNote(drk, noteId, content)
- decryptNote(drk, noteId, ciphertext, aad)
- encryptNoteWithDek(dek, noteId, content)
- decryptNoteWithDek(dek, noteId, ciphertext, aad)
- wrapPrivateKey(jwk, drk)
- unwrapPrivateKey(wrapped, drk)

Sharing helpers
- resolveDek(noteId, isOwner, drk)
- setHooks({ fetchNoteDek, fetchWrappedEncPrivateJwk }) to integrate per‑app APIs.

ZK mode
- zk=true (default) adds zk_pub to /authorize and expects DRK via fragment JWE.
- zk=false behaves like a standard OIDC client (no ZK parameters).

