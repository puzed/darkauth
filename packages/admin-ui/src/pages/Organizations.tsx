import { Building2, Edit, Plus, Trash2, Users as UsersIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/empty-state";
import ErrorBanner from "@/components/feedback/error-banner";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import RowActions from "@/components/row-actions";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import ListPagination from "@/components/table/list-pagination";
import SortableTableHead from "@/components/table/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import tableStyles from "@/components/ui/table.module.css";
import adminApiService, { type Organization, type SortOrder } from "@/services/api";
import { logger } from "@/services/logger";
import styles from "./Organizations.module.css";

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
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const toggleSort = (field: string) => {
    setCurrentPage(1);
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortOrder("asc");
  };

  const loadOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getOrganizationsPaged({
        page: currentPage,
        limit: 20,
        search: debouncedSearch,
        sortBy,
        sortOrder,
      });
      setOrganizations(response.organizations);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (loadError) {
      logger.error(loadError, "Failed to load organizations");
      setError("Unable to load organizations. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const getOrganizationId = (organization: Organization) =>
    organization.organizationId || (organization as Organization & { id?: string }).id || "";

  const openOrganization = (organization: Organization) => {
    const organizationId = getOrganizationId(organization);
    if (!organizationId) {
      setError("Organization ID is missing");
      return;
    }
    navigate(`/organizations/${encodeURIComponent(organizationId)}`);
  };

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
    } catch (deleteError) {
      logger.error(deleteError, "Failed to delete organization");
      setError("Unable to delete organization. Please try again.");
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
          <Button onClick={() => navigate("/organizations/new")}>
            <Plus />
            Create Organization
          </Button>
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
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Name"
                    isActive={sortBy === "name"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("name")}
                  />
                  <SortableTableHead
                    label="Slug"
                    isActive={sortBy === "slug"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("slug")}
                  />
                  <TableHead>Members</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((organization, index) => {
                  const organizationId = getOrganizationId(organization);
                  const rowKey =
                    organizationId || organization.slug || organization.name || `${index}`;
                  return (
                    <TableRow key={rowKey}>
                      <TableCell>
                        <button
                          type="button"
                          className={tableStyles.primaryActionButton}
                          onClick={() => openOrganization(organization)}
                        >
                          <span className={tableStyles.primaryActionText}>{organization.name}</span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <code className={styles.slugCode}>{organization.slug}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{organization.memberCount || 0}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{organization.roleCount || 0}</Badge>
                      </TableCell>
                      <TableCell>
                        <RowActions
                          items={[
                            {
                              key: "edit",
                              label: "Manage Organization",
                              icon: <Edit className="h-4 w-4" />,
                              onClick: () => openOrganization(organization),
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div style={{ marginTop: 20 }}>
              <ListPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          </>
        )}
      </ListCard>
    </div>
  );
}
