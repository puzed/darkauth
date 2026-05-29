import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.darkauth.com",
  integrations: [
    starlight({
      title: "DarkAuth Docs",
      description: "Documentation for DarkAuth users, admins, and developers.",
      customCss: ["./src/styles/starlight.css"],
      favicon: "/favicon.svg",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/puzed/darkauth",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/puzed/darkauth/edit/main/packages/docs/",
      },
      sidebar: [
        {
          label: "Start Here",
          items: [
            { label: "Docs Home", slug: "" },
            { label: "Quickstart", slug: "quickstart" },
            { label: "Core Concepts", slug: "concepts" },
          ],
        },
        {
          label: "Users",
          items: [{ autogenerate: { directory: "users" } }],
        },
        {
          label: "Admins",
          items: [{ autogenerate: { directory: "admins" } }],
        },
        {
          label: "Developers",
          items: [
            { label: "Overview", slug: "developers" },
            {
              label: "OIDC",
              items: [
                { label: "Public Clients", slug: "developers/oidc/public-clients" },
                { label: "Confidential Clients", slug: "developers/oidc/confidential-clients" },
                { label: "Session Lifecycle", slug: "developers/oidc/session-lifecycle" },
              ],
            },
            { label: "ZK DRK Delivery", slug: "developers/zk-drk-delivery" },
            { label: "Key Management", slug: "developers/key-management" },
            { label: "OPAQUE", slug: "developers/opaque" },
            { label: "TypeScript SDK", slug: "developers/sdk/typescript" },
            { label: "Example Todos App", slug: "developers/examples/todos" },
            { label: "Users Directory", slug: "developers/users-directory" },
            { label: "Organizations and RBAC", slug: "developers/organizations-rbac" },
            { label: "OTP", slug: "developers/otp" },
            { label: "Password Reset", slug: "developers/password-reset" },
            {
              label: "API",
              items: [{ autogenerate: { directory: "developers/api" } }],
            },
            {
              label: "Contributing",
              items: [{ autogenerate: { directory: "developers/contributing" } }],
            },
          ],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
        {
          label: "Security",
          items: [{ autogenerate: { directory: "security" } }],
        },
        {
          label: "Releases",
          items: [{ autogenerate: { directory: "releases" } }],
        },
      ],
    }),
  ],
});
