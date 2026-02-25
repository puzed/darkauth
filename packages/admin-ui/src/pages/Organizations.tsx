import {
  Building2,
  Edit,
  Filter,
  Plus,
  RefreshCcw,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/empty-state";
import ErrorBanner from "@/components/feedback/error-banner";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import RowActions from "@/components/row-actions";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import tableStyles from "@/components/table.module.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import adminApiService, { type Organization } from "@/services/api";
import { logger } from "@/services/logger";

export default function Organizations() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const loadOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getOrganizationsPaged(
        currentPage,
        20,
        debouncedSearch
      );
      setOrganizations(response.organizations);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (error) {
      logger.error(error, "Failed to load organizations");
      setError(error instanceof Error ? error.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const getOrganizationId = (organization: Organization) =>
    organization.organizationId || (organization as Organization & { id?: string }).id || "";

  const handleDeleteOrganization = async (organization: Organization) => {
    const organizationId = getOrganizationId(organization);
    if (!organizationId) {
      setError("Organization ID is missing");
      return;
    }
    if (!confirm(`Delete organization "${organization.name}"? This action cannot be undone.`))
      return;
    try {
      setError(null);
      await adminApiService.deleteOrganization(organizationId);
      setOrganizations((prev) => prev.filter((org) => getOrganizationId(org) !== organizationId));
      setTotalCount((prev) => Math.max(prev - 1, 0));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete organization");
    }
  };

  const totalMembers = useMemo(
    () => organizations.reduce((total, org) => total + (org.memberCount || 0), 0),
    [organizations]
  );

  if (loading && organizations.length === 0) return null;

  return (
    <div>
      <PageHeader
        title="Organizations"
        subtitle="Manage organizations and member access"
        actions={
          <>
            <Button variant="outline" onClick={loadOrganizations}>
              <RefreshCcw />
              Refresh
            </Button>
            <Button onClick={() => navigate("/organizations/new")}>
              <Plus />
              Create Organization
            </Button>
          </>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <StatsGrid>
        <StatsCard
          title="Total Organizations"
          icon={<Building2 size={16} />}
          value={totalCount}
          description="Organization records"
        />
        <StatsCard
          title="Visible Members"
          icon={<UsersIcon size={16} />}
          value={totalMembers}
          description="Members in current results"
        />
      </StatsGrid>

      <ListCard
        title="Organization Management"
        description="View and manage all organizations"
        search={{
          placeholder: "Search organizations...",
          value: searchQuery,
          onChange: setSearchQuery,
        }}
        rightActions={
          <Button variant="outline" size="icon">
            <Filter size={16} />
          </Button>
        }
      >
        {organizations.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title="No Organizations Found"
            description={
              searchQuery ? "Try adjusting your search" : "No organizations have been created yet"
            }
          />
        ) : (
          <table className={tableStyles.table}>
            <thead className={tableStyles.header}>
              <tr>
                <th className={tableStyles.head}>Name</th>
                <th className={tableStyles.head}>Slug</th>
                <th className={tableStyles.head}>Members</th>
                <th className={tableStyles.head}>Roles</th>
                <th className={`${tableStyles.head} ${tableStyles.actionCell}`}></th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((organization, index) => {
                const organizationId = getOrganizationId(organization);
                const rowKey =
                  organizationId || organization.slug || organization.name || `${index}`;
                return (
                  <tr key={rowKey} className={tableStyles.row}>
                    <td className={tableStyles.cell} style={{ fontWeight: 500 }}>
                      {organization.name}
                    </td>
                    <td className={tableStyles.cell}>
                      <code
                        style={{
                          backgroundColor: "hsl(var(--muted))",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: "0.875rem",
                        }}
                      >
                        {organization.slug}
                      </code>
                    </td>
                    <td className={tableStyles.cell}>
                      <Badge variant="outline">{organization.memberCount || 0}</Badge>
                    </td>
                    <td className={tableStyles.cell}>
                      <Badge variant="secondary">{organization.roleCount || 0}</Badge>
                    </td>
                    <td className={tableStyles.cell}>
                      <RowActions
                        items={[
                          {
                            key: "edit",
                            label: "Manage Organization",
                            icon: <Edit className="h-4 w-4" />,
                            onClick: () =>
                              organizationId
                                ? navigate(`/organizations/${organizationId}`)
                                : setError("Organization ID is missing"),
                          },
                          {
                            key: "delete",
                            label: "Delete Organization",
                            icon: <Trash2 className="h-4 w-4" />,
                            destructive: true,
                            onClick: () => handleDeleteOrganization(organization),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </ListCard>

      {totalPages > 1 && (
        <div style={{ marginTop: 20 }}>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink isActive>{currentPage}</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
