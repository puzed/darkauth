import type { ReactNode } from "react";
import { useBranding } from "../hooks/useBranding";
import ThemeToggle from "./ThemeToggle";

export default function AuthorizePageFrame({ children }: { children: ReactNode }) {
  const branding = useBranding();
  return (
    <div className="app da-app">
      <div className="container da-container">
        <div className="header da-header authorize-page-header">
          <div className="brand da-brand">
            <span className="brand-icon da-brand-icon">
              <img src={branding.getLogoUrl()} alt={branding.getTitle()} />
            </span>
            <h1 className="da-brand-title">{branding.getTitle()}</h1>
          </div>
          <div className="user-info da-user-info authorize-page-actions">
            <ThemeToggle />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
