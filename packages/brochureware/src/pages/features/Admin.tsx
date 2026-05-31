import FeatureDeepDive from "../../components/FeatureDeepDive";

export default function Admin() {
  return (
    <FeatureDeepDive
      eyebrow="Feature"
      title="Admin console & audit"
      sub="One console to run the whole system."
      definition="The admin console (port 9081) provides full management of users, organizations, OAuth clients, signing keys, federation, SCIM, branding, email templates, and a complete audit log with export."
      whyItMatters={
        <p>
          Visibility and control are prerequisites for security. The admin console gives operators a clear view of the system state: who has accounts, which clients are active, what keys are in rotation, what actions were taken and when. The audit log is the paper trail for compliance and incident response.
        </p>
      }
      howItWorksEli5={
        <p>
          It's a secure web dashboard. You log in with your admin credentials, and you get a full view of everything: users, organizations, connected apps, signing keys, and a timeline of every significant action. You can add users, revoke sessions, rotate keys, and export the audit log — all from the browser.
        </p>
      }
      howItWorksPrecise={
        <p>
          The admin console is a separate Vite + React app served on port 9081. Admin authentication uses a separate OPAQUE flow from user authentication — admin credentials are completely separate. All configuration (users, clients, settings, branding) is stored in Postgres. Private signing keys and client secrets are encrypted at rest using the system KEK. The audit log records every significant admin action with timestamp, actor, action type, and diff — with a detail view and CSV/JSON export.
        </p>
      }
      details={[
        "Dashboard: users, OAuth clients, ZK-enabled clients, signing keys, system health, changelog",
        "Users: create, edit, suspend, view sessions, force MFA",
        "Organizations, roles, and permissions management",
        "OAuth clients: create, edit, enable/disable, configure ZK delivery",
        "Federation: manage upstream OIDC and SAML connections",
        "SCIM tokens: create and revoke provisioning tokens",
        "Signing keys: JWKS rotation (EdDSA/Ed25519), view current and retired keys",
        "Admin users: separate cohort with separate OPAQUE authentication",
        "Audit logs: list, detail, filter by actor/action, export (CSV/JSON)",
        "Branding: full UI customizer with live preview",
        "Email templates: customize all transactional emails",
        "Settings: runtime config stored in Postgres, editable in UI",
        "Private keys and client secrets encrypted at rest with system KEK",
      ]}
      related={[
        { label: "Self-host guide", to: "/self-host" },
        { label: "Security overview", to: "/security" },
        { label: "White-label branding", to: "/features/branding" },
      ]}
    />
  );
}
