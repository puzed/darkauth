import FeatureDeepDive from "../../components/FeatureDeepDive";
import FlowDiagram from "../../components/FlowDiagram";

const fragmentFlow = [
  { from: 0, to: 0, label: "Generate ephemeral ECDH P-256 keypair", note: "zk_priv stays in the app; zk_pub goes to DarkAuth" },
  { from: 0, to: 1, label: "GET /api/authorize?zk_pub=...", note: "with normal PKCE parameters" },
  { from: 1, to: 0, label: "OPAQUE login UI" },
  { from: 0, to: 0, label: "Derive MK -> KW and unwrap DRK" },
  { from: 0, to: 0, label: "Build drk_jwe", note: "ECDH-ES + A256GCM(DRK, zk_pub)" },
  { from: 0, to: 1, label: "POST /api/authorize/finalize", note: "request_id + drk_hash only" },
  { from: 1, to: 0, label: "Redirect with code" },
  { from: 0, to: 0, label: "Attach #drk_jwe in the URL fragment" },
  { from: 0, to: 1, label: "POST /api/token" },
  { from: 1, to: 0, label: "{ id_token, zk_drk_hash, ... }" },
  { from: 0, to: 0, label: "Verify hash and decrypt JWE with zk_priv" },
] as const;

export default function ZkKeys() {
  return (
    <FeatureDeepDive
      eyebrow="Feature"
      title="Zero-knowledge key delivery"
      sub="A 32-byte encryption key, derived on the user's device, handed to your app through the login — without the server ever being able to read it."
      definition="The Data Root Key (DRK) is generated client-side, wrapped under a key derived from the user's password via OPAQUE, and stored server-side only as ciphertext. ZK-enabled apps receive the DRK via a JWE in the URL fragment — a channel the server never touches."
      whyItMatters={
        <p>
          This is what lets you build genuinely end-to-end encrypted apps on top of a normal-feeling login. The user logs in once; your app gets identity <em>and</em> a usable encryption key. You don't need to build a separate key management system or ask users to manage their own key files. The server holds only a locked box — and it cannot open it.
        </p>
      }
      howItWorksEli5={
        <p>
          Your device makes a secret key from your password and uses it to lock your data key. The server keeps only the locked box. When you log in, the key is delivered to the app in a sealed envelope — but the envelope doesn't route through the server. Your app gets both your identity (from the ID token) and your data key (from the fragment), and the server can verify the delivery without ever seeing the key inside.
        </p>
      }
      howItWorksPrecise={
        <div>
          <p style={{ marginBottom: "0.75rem" }}>The full ZK fragment flow:</p>
          <FlowDiagram lanes={["RP App (Browser)", "DarkAuth (User Port)"]} steps={fragmentFlow} />
          <p style={{ marginTop: "0.75rem" }}>
            The JWE uses ECDH-ES (P-256) with A256GCM. The AAD binds the key to <code>sub</code> and <code>client_id</code>. The server stores <code>zk_drk_hash</code> — the SHA-256 of the JWE ciphertext — for integrity verification. The JWE itself is never stored or transmitted by the server: it travels only in the URL fragment, which does not reach the server per HTTP spec.
          </p>
        </div>
      }
      details={[
        "DRK is 32 bytes, randomly generated client-side on first login",
        "Server stores: WRAPPED_DRK = AEAD_Encrypt(KW, DRK, aad=sub). Never the plaintext DRK.",
        "JWE algorithm: ECDH-ES (P-256) + A256GCM, compact serialization",
        "Fragment delivery: drk_jwe arrives in the URL fragment, never in the server response body",
        "Integrity binding: token endpoint returns zk_drk_hash; app must verify before using the DRK",
        "Opt-in per client: zk_delivery='fragment-jwe' must be set in client config",
        "PKCE S256 is required for all ZK clients",
        "zk_pub must be a valid P-256 public key — malformed or weak keys are rejected",
        "Password change re-wraps the same DRK under the new KW — data does not need re-encryption",
        "Memory-only DRK custody is the default — page reload triggers a fresh ZK authorization",
      ]}
      caveats={
        <>
          <strong>Trust boundary:</strong> ZK key delivery protects against database exfiltration and server-side reads during honest frontend operation. A compromised browser, XSS on the auth UI origin, a malicious RP app, or supply-chain compromise in the JavaScript can read the DRK from browser memory while it is in use. This is the hosted-web trust boundary — it cannot be eliminated without hardware-backed key storage.
          <br /><br />
          <strong>Email reset:</strong> Password reset restores account access. If the old DRK wrapping was tied to the previous password's export_key, the DRK cannot be unwrapped with the new key. Users must use old-password recovery or set up new keys after resetting.
        </>
      }
      related={[
        { label: "How it works", to: "/how-it-works" },
        { label: "Security: ZK extension", to: "/security/zero-knowledge" },
        { label: "Developer SDK", to: "/developers/sdk" },
        { label: "Zero-knowledge passwords", to: "/features/zero-knowledge-passwords" },
      ]}
    />
  );
}
