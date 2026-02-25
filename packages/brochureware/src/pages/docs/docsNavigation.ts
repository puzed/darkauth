import { BookOpen, Boxes, Cog, Code, Handshake, LayoutTemplate, Shield, Wrench } from "lucide-react";

export type DocsLink = {
  title: string;
  path: string;
  description?: string;
};

export type DocsSection = {
  title: string;
  icon: typeof BookOpen;
  links: DocsLink[];
};

export const docsSections: DocsSection[] = [
  {
    title: "Documentation",
    icon: BookOpen,
    links: [
      {
        title: "Introduction",
        path: "/docs/introduction",
        description: "What DarkAuth is and what problems it solves.",
      },
      {
        title: "Quickstart",
        path: "/docs/quickstart",
        description: "Install, run, and get a first auth flow working quickly.",
      },
    ],
  },
  {
    title: "Concepts",
    icon: Boxes,
    links: [
      {
        title: "Security Model",
        path: "/docs/concepts/security-model",
        description: "OPAQUE, sessions, and trust boundaries.",
      },
      {
        title: "Architecture",
        path: "/docs/concepts/architecture",
        description: "Ports, servers, and routing across user and admin API surfaces.",
      },
    ],
  },
  {
    title: "Developer Guides",
    icon: Code,
    links: [
      {
        title: "Public Clients",
        path: "/docs/guides/public-client-flow",
        description: "Browser/SPAs with PKCE and short-lived auth codes.",
      },
      {
        title: "Confidential Clients",
        path: "/docs/guides/confidential-client-flow",
        description: "Server-to-server flows with client credentials.",
      },
      {
        title: "Users Directory",
        path: "/docs/guides/users-directory",
        description: "Integrate `/api/users` in browser and backend clients.",
      },
      {
        title: "Organizations and RBAC",
        path: "/docs/guides/organizations-rbac",
        description: "Org context, role-based permissions, and group behavior.",
      },
      {
        title: "OTP and Login Policy",
        path: "/docs/guides/otp-policy",
        description: "Step-up auth and OTP setup/verification flows.",
      },
    ],
  },
  {
    title: "API Reference",
    icon: LayoutTemplate,
    links: [
      {
        title: "API Overview",
        path: "/docs/api/overview",
        description: "Complete endpoint map and where auth is required.",
      },
      {
        title: "Auth & OIDC",
        path: "/docs/api/auth",
        description: "authorize, token, session, refresh, logout.",
      },
      {
        title: "OPAQUE",
        path: "/docs/api/opaque",
        description: "Registration and login messages for secure password flows.",
      },
      {
        title: "OTP",
        path: "/docs/api/otp",
        description: "TOTP setup, verify, and re-auth gating.",
      },
      {
        title: "Crypto APIs",
        path: "/docs/api/crypto",
        description: "Wrapped DRK and encrypted key management endpoints.",
      },
      {
        title: "Users Directory APIs",
        path: "/docs/api/users-directory",
        description: "Search and read users by public/bearer mode.",
      },
      {
        title: "Organizations APIs",
        path: "/docs/api/organizations",
        description: "User-side org endpoints and org context resolution.",
      },
      {
        title: "Admin APIs",
        path: "/docs/api/admin",
        description: "Management APIs for users, roles, permissions, clients, and more.",
      },
      {
        title: "Installation APIs",
        path: "/docs/api/installation",
        description: "First-run install and bootstrap flow.",
      },
      {
        title: "OpenAPI Spec",
        path: "/docs/api/openapi",
        description: "Generated contract from controller schema metadata.",
      },
    ],
  },
  {
    title: "SDKs",
    icon: Handshake,
    links: [
      {
        title: "@darkauth/client",
        path: "/docs/sdks",
        description: "Token handling, key derivation, and callback processing.",
      },
    ],
  },
  {
    title: "Operations",
    icon: Cog,
    links: [
      {
        title: "Deployment",
        path: "/docs/operations/deployment",
        description: "Config file, database options, and production settings.",
      },
      {
        title: "Branding",
        path: "/docs/operations/branding",
        description: "Theme, logos, and custom CSS endpoints.",
      },
      {
        title: "Troubleshooting",
        path: "/docs/operations/troubleshooting",
        description: "Common setup and integration errors.",
      },
    ],
  },
  {
    title: "Security",
    icon: Shield,
    links: [
      {
        title: "Threat Model and Controls",
        path: "/docs/concepts/security-model",
        description: "CSRF, rate limits, key protection, and audits.",
      },
    ],
  },
  {
    title: "Release",
    icon: Wrench,
    links: [
      {
        title: "How DarkAuth Works",
        path: "/how-it-works",
        description: "Public overview of platform features.",
      },
      {
        title: "Changelog",
        path: "/changelog",
        description: "Recent changes and compatibility notes.",
      },
    ],
  },
];

export const docsPages = new Set(
  docsSections.flatMap((section) => section.links.map((link) => link.path))
);
