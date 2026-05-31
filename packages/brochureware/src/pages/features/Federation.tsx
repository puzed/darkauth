import FeatureDeepDive from "../../components/FeatureDeepDive";

export default function Federation() {
  return (
    <FeatureDeepDive
      eyebrow="Feature"
      title="Federation — upstream SSO"
      sub="Let users sign in through an upstream OIDC or SAML 2.0 provider."
      definition="DarkAuth acts as the downstream OIDC provider for your apps, and connects upstream to your organization's identity provider — Google Workspace, Okta, Azure AD, or any OIDC/SAML 2.0-compatible system."
      whyItMatters={
        <p>
          If your users already have accounts in a corporate IdP or social login provider, forcing them to create and remember another password is friction you don't need. Federation lets them use their existing credentials while DarkAuth handles the OIDC layer your apps talk to. You control claim mapping and account-linking policy.
        </p>
      }
      howItWorksEli5={
        <p>
          Your users click "Sign in with [Your Company]" at the DarkAuth login page. DarkAuth redirects them to your corporate SSO, they authenticate there, and DarkAuth receives confirmation. DarkAuth then issues its own ID token to your app — your app never needs to know which upstream provider was used.
        </p>
      }
      howItWorksPrecise={
        <p>
          Upstream connections are configured in the admin console: issuer URL (OIDC) or entity ID (SAML), client ID and encrypted client secret, JWKS or metadata URL, and an enable toggle. DarkAuth performs a standard OIDC authorization code flow (or SAML SP-initiated SSO) against the upstream provider, maps incoming claims to DarkAuth's user model, and links or provisions the account per the configured account-linking policy. Domain routing allows automatic provider selection by email domain.
        </p>
      }
      details={[
        "Upstream OIDC: any OIDC-compliant provider (Google, Okta, Azure AD, etc.)",
        "Upstream SAML 2.0: SP-initiated SSO with entity ID and metadata",
        "Configurable per-connection: issuer, client ID, encrypted secret, JWKS/metadata, enable toggle",
        "Claim mapping: map upstream claims to DarkAuth user attributes",
        "Account-linking policy: link by email, sub, or external ID",
        "Domain routing: route by email domain to the correct upstream provider",
        "Multiple upstream connections supported simultaneously",
        "Federation authenticates identity only — ZK key delivery requires a separate key unlock step",
      ]}
      caveats={
        <>
          <strong>ZK key delivery note:</strong> Federation identifies the user but does not provide the OPAQUE <code>export_key</code> used to unwrap the DRK. ZK-enabled clients that require key delivery must have a separate key unlock mechanism (e.g., a secondary OPAQUE verification or recovery key) before the DRK can be delivered.
        </>
      }
      related={[
        { label: "SCIM provisioning", to: "/features/scim" },
        { label: "Organizations & RBAC", to: "/features/organizations-rbac" },
        { label: "Security overview", to: "/security" },
      ]}
    />
  );
}
