import { ArrowLeft } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import FormActions from "@/components/layout/form-actions";
import { FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import MutedText from "@/components/text/muted-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import adminApiService from "@/services/api";

export default function AdminUserCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const emailId = useId();
  const nameId = useId();
  const roleId = useId();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    role: "read" as "read" | "write",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.name) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await adminApiService.createAdminUser(formData);
      toast({
        title: "Success",
        description: "Admin user created successfully",
      });
      navigate("/settings/admin-users");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create admin user",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Create Admin User"
        subtitle="Add a new administrator account"
        actions={
          <Button variant="outline" onClick={() => navigate("/settings/admin-users")}>
            <ArrowLeft />
            Back
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Admin User Details</CardTitle>
          <CardDescription>
            Create a new admin user. They will need to set their password on first login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FormGrid>
              <div>
                <Label htmlFor={emailId}>Email *</Label>
                <Input
                  id={emailId}
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="admin@example.com"
                  required
                />
              </div>

              <div>
                <Label htmlFor={nameId}>Name *</Label>
                <Input
                  id={nameId}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <Label htmlFor={roleId}>Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: "read" | "write") =>
                    setFormData({ ...formData, role: value })
                  }
                >
                  <SelectTrigger id={roleId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read Only</SelectItem>
                    <SelectItem value="write">Write Access</SelectItem>
                  </SelectContent>
                </Select>
                <MutedText size="xs" spacing="xs">
                  {formData.role === "write"
                    ? "Can view and modify all settings and data"
                    : "Can only view data, cannot make changes"}
                </MutedText>
              </div>
            </FormGrid>

            <FormActions align="start" withMargin>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Admin User"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/settings/admin-users")}
              >
                Cancel
              </Button>
            </FormActions>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
