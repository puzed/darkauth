import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import FormActions from "@/components/layout/form-actions";
import { FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import MutedText from "@/components/text/muted-text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import adminApiService, { type AdminUser } from "@/services/api";

export default function AdminUserEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const emailId = useId();
  const nameId = useId();
  const roleId = useId();
  const [loading, setLoading] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    role: "read" as "read" | "write",
  });

  useEffect(() => {
    const loadAdminUser = async () => {
      if (!id) return;

      try {
        setLoadingUser(true);
        const response = await adminApiService.getAdminUsers(1, 100);
        const user = response.adminUsers.find((u) => u.id === id);

        if (user) {
          setAdminUser(user);
          setFormData({
            email: user.email,
            name: user.name,
            role: user.role,
          });
        } else {
          toast({
            title: "Error",
            description: "Admin user not found",
            variant: "destructive",
          });
          navigate("/settings/admin-users");
        }
      } catch (_error) {
        toast({
          title: "Error",
          description: "Failed to load admin user",
          variant: "destructive",
        });
        navigate("/settings/admin-users");
      } finally {
        setLoadingUser(false);
      }
    };

    loadAdminUser();
  }, [id, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.name || !id) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await adminApiService.updateAdminUser(id, formData);
      toast({
        title: "Success",
        description: "Admin user updated successfully",
      });
      navigate("/settings/admin-users");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update admin user",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loadingUser) return <div>Loading admin user...</div>;
  if (!adminUser) return <div>Admin user not found</div>;

  return (
    <div>
      <PageHeader
        title="Edit Admin User"
        subtitle="Update administrator account details"
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
          <CardDescription>Update the admin user's information and role.</CardDescription>
        </CardHeader>
        <CardContent>
          {adminUser?.passwordResetRequired && (
            <Alert variant="warning" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <AlertTriangle size={18} />
                <AlertTitle>Password Reset Required</AlertTitle>
              </div>
              <AlertDescription>
                The user is required to reset their password on next login
              </AlertDescription>
            </Alert>
          )}
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
                {loading ? "Saving..." : "Save Changes"}
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
