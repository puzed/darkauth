import FeatureDeepDive from "../../components/FeatureDeepDive";
import KeyScheduleDiagram from "../../components/KeyScheduleDiagram";

export default function ZkPasswords() {
  return (
    <FeatureDeepDive
      eyebrow="Feature"
      title="Zero-knowledge passwords"
      sub="The server proves you know your password without ever receiving it."
      definition="OPAQUE (RFC 9380, P-256 ciphersuite) lets the server verify your password while your password stays on your device. There is nothing to steal from the database — because the password was never there."
      whyItMatters={
        <p>
          Database breaches happen. When they do, the usual story is: "we hashed with bcrypt, change your passwords." With OPAQUE, that story changes. The server stores an <em>opaque verifier</em> — a cryptographic record that proves the server knows you have the right password, without encoding the password itself in a recoverable form. An attacker who exfiltrates the database gets verifiers they cannot reverse. Insider reads face the same wall.
        </p>
      }
      howItWorksEli5={
        <p>
          Think of it like a mathematical challenge-response. Instead of typing your password into a box and sending it, your browser and the server do a cryptographic dance. The server issues a challenge, your browser responds with a value derived from your password, and the server can check the response matches without ever knowing the password. After it's done, your browser has a stable secret — the <code>export_key</code> — that the server never sees.
        </p>
      }
      howItWorksPrecise={
        <div>
          <p>OPAQUE (RFC 9380) is a Password-Authenticated Key Exchange. DarkAuth uses the P-256 ciphersuite. The flow:</p>
          <ol style={{ paddingLeft: "1.5rem", marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <li><strong>Registration:</strong> Client and server run an OPAQUE registration sub-protocol. The server stores an opaque verifier — not the password, not a hash the password can be recovered from directly.</li>
            <li><strong>Login:</strong> Client runs the OPAQUE login sub-protocol. On success, the client obtains a stable <code>export_key</code> that is deterministic per (user, password). The server validates the protocol completion; no password material is transmitted.</li>
            <li><strong>Key schedule:</strong> The client uses <code>export_key</code> to derive further keys via HKDF-SHA256:</li>
          </ol>
          <KeyScheduleDiagram />
          <p>Enumeration resistance and rate limits are applied to the login endpoint. Separate OPAQUE flows exist for users and admin users.</p>
        </div>
      }
      details={[
        "Protocol: OPAQUE (RFC 9380), P-256 ciphersuite",
        "The server stores an opaque verifier — not the password, not a bcrypt hash",
        "Client derives a stable export_key per (user, password) — server never sees it",
        "export_key seeds the entire client key schedule (MK → KW → WRAPPED_DRK)",
        "Password change re-wraps the DRK under a new KW — no data re-encryption required",
        "Email reset is SMTP-gated, uses single-use hashed tokens, revokes active sessions",
        "Anti-enumeration: reset endpoint returns generic responses regardless of whether email exists",
        "Separate OPAQUE registration/login flows for users vs. admin users",
        "Rate limiting applied to OPAQUE login and finalize endpoints",
      ]}
      caveats={
        <>
          <strong>Honest caveat:</strong> OPAQUE protects against a passive server and a database attacker. It does not protect against a malicious server that serves compromised JavaScript. If the auth UI is served from a compromised origin, or if XSS runs on the page while login is in progress, the export_key can be read in browser memory. The trust boundary is the JavaScript execution environment.
        </>
      }
      related={[
        { label: "Zero-knowledge key delivery", to: "/features/zero-knowledge-keys" },
        { label: "Security whitepaper", to: "/security/whitepaper" },
        { label: "How it works", to: "/how-it-works" },
      ]}
    />
  );
}
