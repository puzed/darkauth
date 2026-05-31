import FeatureDeepDive from "../../components/FeatureDeepDive";

export default function Scim() {
  return (
    <FeatureDeepDive
      eyebrow="Feature"
      title="SCIM 2.0 provisioning"
      sub="Provision and deprovision users and groups from your identity provider."
      definition="SCIM 2.0 (System for Cross-domain Identity Management) lets your corporate IdP automatically create, update, and deactivate user accounts in DarkAuth — without manual admin work."
      whyItMatters={
        <p>
          When someone joins or leaves your organization, their access should be provisioned or revoked automatically. SCIM connects your HR system or corporate IdP (Okta, Azure AD, OneLogin) directly to DarkAuth's user lifecycle — new hires get accounts, departures get deactivated and their sessions revoked.
        </p>
      }
      howItWorksEli5={
        <p>
          Your corporate directory (e.g., Okta) is configured with DarkAuth's SCIM endpoint and a bearer token. When HR adds a new employee, Okta automatically creates a user in DarkAuth. When the employee leaves, Okta deactivates the DarkAuth account and their sessions are revoked. No manual admin needed.
        </p>
      }
      howItWorksPrecise={
        <p>
          DarkAuth implements the SCIM v2 protocol at a configurable base URL. Supported resources: <code>Users</code>, <code>Groups</code>. Standard service provider configuration endpoints: <code>ServiceProviderConfig</code>, <code>ResourceTypes</code>, <code>Schemas</code>. User lifecycle: active/suspended/deactivated. Deactivation revokes active sessions and refresh tokens immediately. Each SCIM connection is issued a scoped provisioning token with configurable expiry. External-ID mapping links the IdP's user record to DarkAuth's internal subject.
        </p>
      }
      details={[
        "SCIM v2 Users and Groups endpoints",
        "ServiceProviderConfig, ResourceTypes, Schemas endpoints for IdP compatibility",
        "User lifecycle: active / suspended / deactivated",
        "Deactivation immediately revokes active sessions and refresh tokens",
        "Scoped provisioning tokens with configurable expiry",
        "External-ID mapping for IdP-to-DarkAuth user linking",
        "Compatible with Okta, Azure AD, OneLogin, and any SCIM 2.0-compliant IdP",
      ]}
      caveats={
        <>
          <strong>SCIM provisions accounts — it is not an auth method.</strong> Provisioned users still authenticate using their chosen method (OPAQUE password, federation, etc.) on first login. SCIM does not provide passwords or bypass authentication. Users provisioned via SCIM may need to complete a first-login key setup step if ZK key delivery is required.
        </>
      }
      related={[
        { label: "Federation", to: "/features/federation" },
        { label: "Organizations & RBAC", to: "/features/organizations-rbac" },
        { label: "Admin console", to: "/features/admin" },
      ]}
    />
  );
}
