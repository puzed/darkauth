import type React from "react";
import "../index.css";
import "../App.css";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return <>{children}</>;
}
