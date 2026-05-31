import FeatureDeepDive from "../../components/FeatureDeepDive";

export default function Branding() {
  return (
    <FeatureDeepDive
      eyebrow="Feature"
      title="White-label branding"
      sub="Make the login and user portal yours."
      definition="DarkAuth's login UI and user portal are fully customizable — colors, logo, favicon, typography, all copy, and sanitized custom CSS. Live preview in the admin panel."
      whyItMatters={
        <p>
          When users see a login page, they should see your product — not generic auth software. A branded login builds trust and reduces confusion. DarkAuth's branding system lets you match the login experience to your product's design system without forking the codebase.
        </p>
      }
      howItWorksEli5={
        <p>
          In the admin console, you upload your logo, set your brand colors, change the button text, and write your own error messages. There's a live preview so you see exactly what users will see before you save. Your settings are applied immediately across the login page and user portal.
        </p>
      }
      howItWorksPrecise={
        <p>
          Branding configuration is stored in the database and served to the auth UI and user portal via <code>/config.js</code> with appropriate caching headers. The branding payload includes: brand title and tagline, logo and favicon URLs, full color palette (primary, secondary, background, card, semantic colors), typography (font family, sizes, weights), all UI copy (page titles, button labels, links, error messages, authorization scope descriptions), and a sanitized custom CSS blob. The admin panel includes a live preview iframe that reflects changes in real time before saving.
        </p>
      }
      details={[
        "Brand title, tagline, and custom domain support",
        "Logo and favicon: URL or file upload",
        "Full color palette: primary, secondary, background, card, semantic colors",
        "Typography: font family, base size, heading and body weights",
        "All UI copy: page titles, button labels, links, error messages, authorization/scope text",
        "Sanitized custom CSS: add or override any styles safely",
        "Live preview in the admin panel before saving",
        "Served via /config.js with sensible cache headers",
        "Configuration stored in Postgres — no file editing required",
      ]}
      related={[
        { label: "Admin console", to: "/features/admin" },
        { label: "Self-host guide", to: "/self-host" },
      ]}
    />
  );
}
