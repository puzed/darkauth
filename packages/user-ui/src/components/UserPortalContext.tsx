import { createContext, type ReactNode, useContext } from "react";
import type { UserOrganization } from "../services/api";

interface UserPortalContextValue {
  organizations: UserOrganization[];
  organizationsLoading: boolean;
  activeOrganizationId?: string;
  activeOrganizationLabel?: string | null;
  switchOrganization: (organizationId: string) => Promise<void>;
  refreshOrganizations: () => Promise<UserOrganization[]>;
  addCreatedOrganization: (organization: UserOrganization) => void;
}

const UserPortalContext = createContext<UserPortalContextValue | null>(null);

export function UserPortalProvider({
  value,
  children,
}: {
  value: UserPortalContextValue;
  children: ReactNode;
}) {
  return <UserPortalContext.Provider value={value}>{children}</UserPortalContext.Provider>;
}

export function useUserPortal() {
  return useContext(UserPortalContext);
}
