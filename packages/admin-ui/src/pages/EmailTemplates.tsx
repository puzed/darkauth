import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import adminApiService, { type EmailTemplate, type EmailTemplateKey } from "@/services/api";
import styles from "./EmailTemplates.module.css";

type TemplateDefinition = {
  key: EmailTemplateKey;
  label: string;
  description: string;
  variables: string[];
};

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    key: "signup_verification",
    label: "Account verification",
    description: "Sent when a user must verify their email during signup.",
    variables: ["name", "verification_link"],
  },
  {
    key: "signup_existing_account_notice",
    label: "Existing account signup notice",
    description: "Sent when signup is attempted with an email that already has an account.",
    variables: ["name", "recovery_link"],
  },
  {
    key: "verification_resend_confirmation",
    label: "Resend confirmation",
    description: "Confirms that a fresh verification email was requested.",
    variables: ["name"],
  },
  {
    key: "email_change_verification",
    label: "Email change verification",
    description: "Sent to verify a newly requested account email address.",
    variables: ["name", "verification_link"],
  },
  {
    key: "password_recovery",
    label: "Password recovery",
    description: "Sent when a user requests account recovery.",
    variables: ["name", "recovery_link"],
  },
  {
    key: "admin_test_email",
    label: "Admin SMTP test",
    description: "Used for SMTP test sends from the settings page.",
    variables: ["sent_at"],
  },
];

function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return TEMPLATE_DEFINITIONS.some((definition) => definition.key === value);
}

export default function EmailTemplates() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Record<EmailTemplateKey, EmailTemplate> | null>(null);
  const [selectedKey, setSelectedKey] = useState<EmailTemplateKey>("signup_verification");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApiService.getEmailTemplates();
      setTemplates(response.templates);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load templates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const activeTemplate = useMemo(() => {
    if (!templates) return null;
    return templates[selectedKey] || null;
  }, [templates, selectedKey]);

  const activeDefinition = useMemo(
    () => TEMPLATE_DEFINITIONS.find((definition) => definition.key === selectedKey) ?? null,
    [selectedKey]
  );

  useEffect(() => {
    if (!activeTemplate) return;
    setSubject(activeTemplate.subject);
    setText(activeTemplate.text);
    setHtml(activeTemplate.html);
  }, [activeTemplate]);

  useEffect(() => {
    const tabFromUrl = new URLSearchParams(window.location.search).get("tab");
    if (!tabFromUrl || !isEmailTemplateKey(tabFromUrl)) return;
    setSelectedKey(tabFromUrl);
  }, []);

  const setTab = (value: string) => {
    if (!isEmailTemplateKey(value)) return;
    setSelectedKey(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const hasChanges =
    !!activeTemplate &&
    (subject !== activeTemplate.subject ||
      text !== activeTemplate.text ||
      html !== activeTemplate.html);

  const resetDraft = () => {
    if (!activeTemplate) return;
    setSubject(activeTemplate.subject);
    setText(activeTemplate.text);
    setHtml(activeTemplate.html);
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      await adminApiService.updateEmailTemplate(selectedKey, { subject, text, html });
      toast({ title: "Saved", description: `${activeDefinition?.label || "Template"} updated` });
      await load();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save template",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Email Templates"
        subtitle="Manage subject and message content for all outbound system emails"
        actions={
          <div className={styles.headerActions}>
            <Button
              variant="outline"
              onClick={resetDraft}
              disabled={!hasChanges || saving || loading}
            >
              Reset
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || saving || loading}>
              {saving ? "Saving..." : "Save Template"}
            </Button>
          </div>
        }
      />

      <div className={styles.container}>
        {loading || !templates ? (
          <Card>
            <CardContent className={styles.loadingState}>Loading templates...</CardContent>
          </Card>
        ) : (
          <Tabs value={selectedKey} onValueChange={setTab} className={styles.tabsRoot}>
            <TabsList className={styles.tabsList}>
              {TEMPLATE_DEFINITIONS.map((definition) => (
                <TabsTrigger key={definition.key} value={definition.key}>
                  {definition.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {TEMPLATE_DEFINITIONS.map((definition) => (
              <TabsContent key={definition.key} value={definition.key}>
                <Card className={styles.tabCard}>
                  <CardHeader>
                    <CardTitle>{definition.label}</CardTitle>
                    <CardDescription>{definition.description}</CardDescription>
                  </CardHeader>
                  <CardContent className={styles.formContent}>
                    <div className={styles.field}>
                      <Label htmlFor={`email-template-subject-${definition.key}`}>Subject</Label>
                      <Input
                        id={`email-template-subject-${definition.key}`}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Email subject line"
                      />
                    </div>

                    <div className={styles.gridFields}>
                      <div className={styles.field}>
                        <Label htmlFor={`email-template-text-${definition.key}`}>Body (text)</Label>
                        <Textarea
                          id={`email-template-text-${definition.key}`}
                          rows={12}
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          placeholder="Plain text version of the email"
                          className={styles.textarea}
                        />
                      </div>

                      <div className={styles.field}>
                        <Label htmlFor={`email-template-html-${definition.key}`}>Body (HTML)</Label>
                        <Textarea
                          id={`email-template-html-${definition.key}`}
                          rows={12}
                          value={html}
                          onChange={(e) => setHtml(e.target.value)}
                          placeholder="HTML version of the email"
                          className={styles.textarea}
                        />
                      </div>
                    </div>

                    <div className={styles.variablesBlock}>
                      <p className={styles.variablesTitle}>Available variables</p>
                      <div className={styles.variablesList}>
                        {definition.variables.map((variable) => (
                          <code key={variable} className={styles.variableBadge}>
                            {"{{"}
                            {variable}
                            {"}}"}
                          </code>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}
