import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import adminApiService, { type Organization } from "@/services/api";
import styles from "./organization-combobox.module.css";

interface OrganizationComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

function labelForOrganization(organization: Organization) {
  return organization.slug ? `${organization.name} (${organization.slug})` : organization.name;
}

export default function OrganizationCombobox({
  value,
  onValueChange,
  placeholder = "Select an organization",
  disabled,
}: OrganizationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const selected = useMemo(
    () =>
      organizations.find((organization) => organization.organizationId === value) ||
      selectedOrganization,
    [organizations, selectedOrganization, value]
  );

  const loadOrganizations = useCallback(
    async (nextPage: number, query: string, replace: boolean) => {
      try {
        setLoading(true);
        const response = await adminApiService.getOrganizationsPaged({
          page: nextPage,
          limit: 25,
          search: query || undefined,
          sortBy: "name",
          sortOrder: "asc",
        });
        setPage(response.pagination.page);
        setTotalPages(response.pagination.totalPages);
        setOrganizations((current) =>
          replace
            ? response.organizations
            : [
                ...current,
                ...response.organizations.filter(
                  (organization) =>
                    !current.some(
                      (existing) => existing.organizationId === organization.organizationId
                    )
                ),
              ]
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    loadOrganizations(1, debouncedSearch, true).catch(() => {
      setOrganizations([]);
      setPage(1);
      setTotalPages(1);
    });
  }, [debouncedSearch, loadOrganizations, open]);

  useEffect(() => {
    if (!value) {
      setSelectedOrganization(null);
      return;
    }
    if (organizations.some((organization) => organization.organizationId === value)) return;
    let cancelled = false;
    adminApiService
      .getOrganization(value)
      .then((organization) => {
        if (!cancelled) setSelectedOrganization(organization);
      })
      .catch(() => {
        if (!cancelled) setSelectedOrganization(null);
      });
    return () => {
      cancelled = true;
    };
  }, [organizations, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const loadMore = () => {
    if (loading || page >= totalPages) return;
    loadOrganizations(page + 1, debouncedSearch, false).catch(() => {});
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <Button
        type="button"
        variant="outline"
        className={styles.trigger}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.value}>
          {selected ? labelForOrganization(selected) : placeholder}
        </span>
        <ChevronsUpDown size={16} />
      </Button>
      {open ? (
        <div className={styles.popover}>
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search organizations..."
            />
            <CommandList>
              <CommandEmpty>
                {loading ? "Loading organizations..." : "No organizations found"}
              </CommandEmpty>
              <CommandGroup>
                {organizations.map((organization) => {
                  const active = organization.organizationId === value;
                  return (
                    <CommandItem
                      key={organization.organizationId}
                      value={organization.organizationId}
                      className={styles.item}
                      onSelect={() => {
                        onValueChange(organization.organizationId);
                        setSelectedOrganization(organization);
                        setOpen(false);
                      }}
                    >
                      <span className={styles.itemLabel}>
                        <strong>{organization.name}</strong>
                        {organization.slug ? <small>{organization.slug}</small> : null}
                      </span>
                      {active ? <Check size={16} /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            {loading || page < totalPages ? (
              <div className={styles.footer}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loading || page >= totalPages}
                  onClick={loadMore}
                >
                  {loading ? <Loader2 size={14} /> : null}
                  {loading ? "Loading..." : "Load more"}
                </Button>
              </div>
            ) : null}
          </Command>
        </div>
      ) : null}
    </div>
  );
}
