import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ErrorBanner from "@/components/feedback/error-banner";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import Stack from "@/components/layout/stack";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import adminApiService from "@/services/api";

export default function OrganizationCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const create = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.createOrganization({ name, slug: slug.trim() || undefined });
      navigate("/organizations");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = name.trim().length > 0;

  return (
    <div>
      <PageHeader title="Create Organization" subtitle="Create a new organization" />

      {error && <ErrorBanner withMargin>{error}</ErrorBanner>}

      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Organization Details</CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid columns={2}>
              <FormField label={<Label>Organization Name *</Label>}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  placeholder="Acme Inc"
                />
              </FormField>
              <FormField label={<Label>Slug</Label>}>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={submitting}
                  placeholder="acme"
                />
              </FormField>
            </FormGrid>
          </CardContent>
        </Card>
      </Stack>

      <FormActions withMargin>
        <Button variant="outline" onClick={() => navigate("/organizations")} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={create} disabled={submitting || !isFormValid}>
          {submitting ? "Creating..." : "Create Organization"}
        </Button>
      </FormActions>
    </div>
  );
}
