import FeatureDeepDive from "../../components/FeatureDeepDive";

export default function OrgsRbac() {
  return (
    <FeatureDeepDive
      eyebrow="Feature"
      title="Organizations & RBAC"
      sub="Multi-tenant org model with role-based access control resolved in org context."
      definition="Users can belong to multiple organizations simultaneously, each with their own role and permission set. RBAC is resolved per organization and surfaced in ID tokens, so your app gets fine-grained access context without building it yourself."
      whyItMatters={
        <p>
          Most applications need to know not just <em>who</em> is logged in, but <em>what they're allowed to do</em> — and often, <em>in which organizational context</em>. DarkAuth handles org membership, role assignment, and permission resolution so your app just reads the claims in the ID token.
        </p>
      }
      howItWorksEli5={
        <p>
          Think of it like a company with departments. You can be in the Engineering org with an Admin role, and in the Marketing org with a Viewer role — at the same time. When you log in to an app in Engineering context, your ID token says you're an Admin. When you switch to Marketing, it reflects your Viewer role. Your app reads those claims and decides what you can do.
        </p>
      }
      howItWorksPrecise={
        <p>
          Organizations have a slug, display name, and optional <code>force_otp</code> flag. Memberships are in states: active, invited, or suspended. Users are assigned one or more reusable roles per org; roles contain fine-grained permission entries. At token issuance, DarkAuth resolves the user's current org context and populates <code>org_id</code>, <code>org_slug</code>, <code>roles</code>, and <code>permissions</code> claims in the ID token. The <code>permissions</code> claim is the union of direct and group-derived permissions for that org context.
        </p>
      }
      details={[
        "Organizations: slug, name, force_otp (per-org MFA enforcement)",
        "Membership states: active, invited, suspended",
        "Users can be members of multiple organizations simultaneously with different roles",
        "Reusable roles with fine-grained permission entries",
        "Token claims: org_id, org_slug, roles[], permissions[] (union of direct + group-derived)",
        "Org switcher in the user portal for users in multiple orgs",
        "Org context resolved at token issuance — no extra API call needed in your app",
        "Admin console: manage orgs, memberships, roles, and permissions",
      ]}
      caveats={
        <>
          <strong>Key isolation:</strong> Organizations handle RBAC. In v1, key derivation is single-tenant — all users share the same key derivation tenant. Per-org key separation is future work.
        </>
      }
      related={[
        { label: "OpenID Connect", to: "/features/oidc" },
        { label: "Admin console", to: "/features/admin" },
        { label: "SCIM provisioning", to: "/features/scim" },
      ]}
    />
  );
}
