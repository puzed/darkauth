import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ErrorBanner from "@/components/feedback/error-banner";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import Stack from "@/components/layout/stack";
import MutedText from "@/components/text/muted-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import adminApiService, {
  type Organization,
  type OrganizationMember,
  type Role,
} from "@/services/api";

type OrganizationPayload = Organization & {
  id?: string;
  members?: unknown;
};

type MemberPayload = Partial<OrganizationMember> & {
  id?: string;
  userId?: string;
  sub?: string;
};

const normalizeOrganizationId = (organization: OrganizationPayload, fallbackId: string): string =>
  organization.organizationId || organization.id || fallbackId;

const normalizeMembers = (members: unknown): OrganizationMember[] => {
  if (!Array.isArray(members)) {
    return [];
  }

  return members.map((raw, index) => {
    const member = (raw || {}) as MemberPayload;
    const roles = Array.isArray(member.roles)
      ? member.roles.filter((role): role is { id: string; key: string; name: string } => {
          return (
            !!role &&
            typeof role === "object" &&
            "id" in role &&
            "key" in role &&
            "name" in role &&
            typeof role.id === "string" &&
            typeof role.key === "string" &&
            typeof role.name === "string"
          );
        })
      : [];

    return {
      membershipId: member.membershipId || member.id || `${member.userSub || member.sub || index}`,
      userSub: member.userSub || member.sub || member.userId || "",
      status: member.status || "active",
      email: member.email || null,
      name: member.name || null,
      roles,
    };
  });
};

export default function OrganizationEdit() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [roleToAssign, setRoleToAssign] = useState<string>("");
  const [addingMemberOpen, setAddingMemberOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!organizationId) {
      setError("Organization ID is required");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [orgData, rolesData] = await Promise.all([
        adminApiService.getOrganization(organizationId),
        adminApiService.getRoles(),
      ]);
      const org = orgData as OrganizationPayload;
      const resolvedOrganizationId = normalizeOrganizationId(org, organizationId);
      setOrganization({
        ...org,
        organizationId: resolvedOrganizationId,
      });
      setName(org.name);
      setSlug(org.slug);
      setAllRoles(rolesData);
      if (rolesData.length > 0) {
        setRoleToAssign(rolesData[0].id);
      }
      const orgMembers = normalizeMembers(org.members);
      if (orgMembers.length > 0) {
        setMembers(orgMembers);
      } else {
        try {
          const memberData = await adminApiService.getOrganizationMembers(resolvedOrganizationId);
          setMembers(normalizeMembers(memberData.members));
        } catch {
          setMembers([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organization");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const availableUsers = useMemo(
    () => members.filter((member) => member.status !== "active"),
    [members]
  );

  const save = async () => {
    if (!organization) return;
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.updateOrganization(organization.organizationId, {
        name,
        slug: slug.trim() || undefined,
      });
      navigate("/organizations");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save organization");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteOrganization = async () => {
    if (!organization) return;
    if (!confirm(`Delete organization "${organization.name}"? This action cannot be undone.`))
      return;
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.deleteOrganization(organization.organizationId);
      navigate("/organizations");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete organization");
    } finally {
      setSubmitting(false);
    }
  };

  const assignRole = async (memberId: string) => {
    if (!organization || !roleToAssign) return;
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.assignOrganizationMemberRoles(organization.organizationId, memberId, [
        roleToAssign,
      ]);
      try {
        const memberData = await adminApiService.getOrganizationMembers(
          organization.organizationId
        );
        setMembers(normalizeMembers(memberData.members));
      } catch {
        setError("Role assigned, but failed to refresh member list");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign role");
    } finally {
      setSubmitting(false);
    }
  };

  const removeRole = async (memberId: string, roleId: string) => {
    if (!organization) return;
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.removeOrganizationMemberRole(
        organization.organizationId,
        memberId,
        roleId
      );
      try {
        const memberData = await adminApiService.getOrganizationMembers(
          organization.organizationId
        );
        setMembers(normalizeMembers(memberData.members));
      } catch {
        setError("Role removed, but failed to refresh member list");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove role");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading organization...</div>;

  if (error && !organization) {
    return (
      <div>
        <ErrorBanner withMargin>{error}</ErrorBanner>
        <Button onClick={() => navigate("/organizations")}>Back to Organizations</Button>
      </div>
    );
  }

  if (!organization) return null;

  const isFormValid = name.trim().length > 0;

  return (
    <div>
      <PageHeader
        title="Manage Organization"
        subtitle={organization.name}
        actions={
          <Button variant="outline" onClick={() => navigate("/organizations")}>
            <ArrowLeft />
            Back
          </Button>
        }
      />

      {error && <ErrorBanner withMargin>{error}</ErrorBanner>}

      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Organization Details</CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid columns={2}>
              <FormField label={<Label>Organization ID</Label>}>
                <Input value={organization.organizationId} readOnly />
              </FormField>
              <FormField label={<Label>Organization Name *</Label>}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                />
              </FormField>
              <FormField label={<Label>Slug</Label>}>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={submitting}
                />
              </FormField>
              <FormField label={<Label>Status</Label>}>
                <Input
                  value={`${members.filter((member) => member.status === "active").length} active members`}
                  readOnly
                />
              </FormField>
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Member Role Assignment</CardTitle>
            <MutedText size="sm">Assign or remove roles for organization members</MutedText>
          </CardHeader>
          <CardContent>
            <FormActions align="between" withBottomMargin>
              <Popover open={addingMemberOpen} onOpenChange={setAddingMemberOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    <UserPlus size={16} />
                    Inactive Members
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" style={{ width: 360, padding: 0 }}>
                  <Command>
                    <CommandInput placeholder="Search members..." />
                    <CommandList>
                      <CommandEmpty>No members found</CommandEmpty>
                      <CommandGroup>
                        {availableUsers.map((member) => (
                          <CommandItem key={member.membershipId}>
                            {member.email || member.userSub}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <div style={{ display: "flex", gap: 8 }}>
                <Select value={roleToAssign} onValueChange={setRoleToAssign}>
                  <SelectTrigger style={{ width: 220 }}>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {allRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FormActions>

            {members.length === 0 ? (
              <MutedText size="sm" spacing="sm">
                No members found for this organization
              </MutedText>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.membershipId}>
                      <TableCell>{member.email || member.userSub}</TableCell>
                      <TableCell>
                        <Badge variant={member.status === "active" ? "default" : "secondary"}>
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {member.roles.map((role) => (
                            <Badge key={role.id} variant="outline">
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => assignRole(member.membershipId)}
                          disabled={!roleToAssign || submitting}
                        >
                          Assign
                        </Button>
                        {member.roles.map((role) => (
                          <Button
                            key={role.id}
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRole(member.membershipId, role.id)}
                            disabled={submitting}
                            aria-label={`Remove ${role.name}`}
                          >
                            <Trash2 size={16} />
                          </Button>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Stack>

      <FormActions withMargin>
        <Button variant="outline" onClick={deleteOrganization} disabled={submitting}>
          Delete Organization
        </Button>
        <Button onClick={save} disabled={submitting || !isFormValid}>
          {submitting ? "Saving..." : "Save Changes"}
        </Button>
      </FormActions>
    </div>
  );
}
