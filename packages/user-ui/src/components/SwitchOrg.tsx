import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import apiService, { type UserOrganization } from "../services/api";
import Button from "./Button";

interface SwitchOrgProps {
  sessionData: { sub: string; name?: string; email?: string; organizationId?: string };
  onOrganizationChanged?: (organization: {
    organizationId: string;
    organizationSlug?: string;
  }) => void;
}

function getLocalReturnPath(returnTo: string | null): string | null {
  if (!returnTo) return null;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
  return returnTo;
}

function getRedirectTarget(
  response: { returnTo?: string; return_to?: string; redirectUrl?: string; redirect_url?: string },
  returnTo: string | null
): string {
  return (
    response.redirectUrl ||
    response.redirect_url ||
    response.returnTo ||
    response.return_to ||
    getLocalReturnPath(returnTo) ||
    "/apps"
  );
}

export default function SwitchOrg({ sessionData, onOrganizationChanged }: SwitchOrgProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("return_to");
  const clientId = searchParams.get("client_id") || undefined;
  const requestedOrganizationId = searchParams.get("organization_id") || "";
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(
    requestedOrganizationId || sessionData.organizationId || ""
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeOrganizations = useMemo(
    () =>
      organizations.filter((organization) =>
        organization.status ? organization.status === "active" : true
      ),
    [organizations]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiService
      .getOrganizations()
      .then((response) => {
        if (cancelled) return;
        const nextOrganizations = response.organizations || [];
        const nextActiveOrganizations = nextOrganizations.filter((organization) =>
          organization.status ? organization.status === "active" : true
        );
        setOrganizations(nextOrganizations);
        setSelectedOrganizationId((current) => {
          if (current && nextActiveOrganizations.some((org) => org.organizationId === current)) {
            return current;
          }
          return nextActiveOrganizations.length === 1
            ? nextActiveOrganizations[0].organizationId
            : "";
        });
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load your organizations. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (!selectedOrganizationId) {
      setError("Choose an organization to continue.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiService.setSessionOrganization(selectedOrganizationId, {
        returnTo: returnTo || undefined,
        clientId,
      });
      onOrganizationChanged?.(response);
      window.location.href = getRedirectTarget(response, returnTo);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        setError("Your account cannot switch to the selected organization.");
      } else {
        setError(err instanceof Error ? err.message : "Unable to switch organization.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="authorize-container switch-org-container">
      <div className="authorize-card da-container">
        <div className="authorize-header">
          <div className="authorize-app">
            <div className="authorize-app-icon">O</div>
            <div className="authorize-app-text">
              <h2 className="authorize-title da-auth-title">Switch organization</h2>
              <p className="authorize-description">
                Choose the active organization connected apps should use for this session.
              </p>
            </div>
          </div>
          <div className="authorize-account">
            <div className="authorize-avatar">
              {(sessionData.name || sessionData.email || "A").slice(0, 1).toUpperCase()}
            </div>
            <div className="authorize-account-text">
              <p className="authorize-account-label">Signed in as</p>
              <p className="authorize-account-name">{sessionData.name || sessionData.email}</p>
              {sessionData.email && sessionData.name && (
                <p className="authorize-account-email">{sessionData.email}</p>
              )}
            </div>
          </div>
        </div>

        <div className="authorize-organizations">
          <h3>Organizations</h3>
          {loading ? (
            <p className="authorize-empty">Loading organizations...</p>
          ) : activeOrganizations.length === 0 ? (
            <p className="authorize-empty">
              Your account is not a member of any active organization.
            </p>
          ) : (
            <fieldset className="authorize-organization-fieldset">
              <legend>Select the organization to make active for connected apps.</legend>
              <div className="authorize-organization-list">
                {activeOrganizations.map((organization) => {
                  const selected = selectedOrganizationId === organization.organizationId;
                  return (
                    <label
                      className="authorize-organization-option"
                      data-selected={selected ? "true" : undefined}
                      key={organization.organizationId}
                    >
                      <input
                        type="radio"
                        name="organization_id"
                        value={organization.organizationId}
                        checked={selected}
                        onChange={() => setSelectedOrganizationId(organization.organizationId)}
                      />
                      <span className="authorize-organization-option-text">
                        <span className="authorize-scope-name">{organization.name}</span>
                        <span className="authorize-scope-description">
                          {organization.slug
                            ? `Connected apps will use ${organization.slug}`
                            : "Connected apps will use this organization"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>

        {error && <div className="error-message da-error-message">{error}</div>}

        <div className="actions da-authorize-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/apps")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="success"
            onClick={handleSubmit}
            disabled={
              loading || submitting || activeOrganizations.length === 0 || !selectedOrganizationId
            }
          >
            {submitting ? "Switching..." : "Switch organization"}
          </Button>
        </div>
      </div>
    </div>
  );
}
