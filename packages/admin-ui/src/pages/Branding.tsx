import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorInput } from "@/components/ui/color-input";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import adminApiService, { type AdminSetting } from "@/services/api";
import { logger } from "@/services/logger";

declare global {
  interface Window {
    __APP_CONFIG__?: { issuer?: string };
  }
}

function toB64Url(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildPreviewUrl(
  issuer: string,
  args: {
    identity: { title: string; tagline: string } | null;
    colors: Record<string, string> | null;
    colorsDark?: Record<string, string> | null;
    wording: Record<string, string> | null;
    font: { family: string; size: string; weight: Record<string, string> } | null;
    customCss: string;
    logo: { data: string | null; mimeType: string | null } | null;
    logoDark?: { data: string | null; mimeType: string | null } | null;
    defaultTheme?: "light" | "dark";
    themeMode?: "inherit" | "light" | "dark";
  }
) {
  const branding = {
    identity: args.identity || { title: "DarkAuth", tagline: "" },
    colors: args.colors || {},
    colorsDark: args.colorsDark || {},
    wording: args.wording || {},
    font: args.font || {
      family: "system-ui, -apple-system, sans-serif",
      size: "16px",
      weight: { normal: "400", medium: "500", bold: "700" },
    },
    customCSS: args.customCss || "",
    logoUrl:
      args.logo?.data && args.logo?.mimeType
        ? `data:${args.logo.mimeType};base64,${args.logo.data}`
        : null,
    logoUrlDark:
      args.logoDark?.data && args.logoDark?.mimeType
        ? `data:${args.logoDark.mimeType};base64,${args.logoDark.data}`
        : null,
  };
  const options = {
    branding,
    defaultTheme: args.defaultTheme || "light",
    themeMode: args.themeMode || "inherit",
  };
  const o = toB64Url(JSON.stringify(options));
  const u = encodeURIComponent(issuer);
  return `/preview?options=${o}&u=${u}&da_preview=1`;
}

function _inferType(s: AdminSetting): "string" | "number" | "boolean" | "object" {
  if (s.type) {
    const t = s.type.toLowerCase();
    if (t === "string") return "string";
    if (t === "number") return "number";
    if (t === "boolean") return "boolean";
    if (t === "object") return "object";
  }
  const v = s.value;
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  return "object";
}

export default function Branding() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [_settings, setSettings] = useState<AdminSetting[]>([]);
  const [identity, setIdentity] = useState<{ title: string; tagline: string } | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [taglineInput, setTaglineInput] = useState("");
  const titleTimer = useRef<number | null>(null);
  const taglineTimer = useRef<number | null>(null);
  const [colors, setColors] = useState<Record<string, string> | null>(null);
  const [colorsDark, setColorsDark] = useState<Record<string, string> | null>(null);
  const [customCss, setCustomCss] = useState<string>("");
  const [wording, setWording] = useState<Record<string, string> | null>(null);
  const [font, setFont] = useState<{
    family: string;
    size: string;
    weight: Record<string, string>;
  } | null>(null);
  const [logo, setLogo] = useState<{ data: string | null; mimeType: string | null } | null>(null);
  const [logoDark, setLogoDark] = useState<{ data: string | null; mimeType: string | null } | null>(
    null
  );
  const [favicon, setFavicon] = useState<{ data: string | null; mimeType: string | null } | null>(
    null
  );
  const [faviconDark, setFaviconDark] = useState<{
    data: string | null;
    mimeType: string | null;
  } | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number>(420);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const issuer = window.__APP_CONFIG__?.issuer || "http://localhost:9080";
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const root = document.documentElement;
    return root.classList.contains("dark") ? "dark" : "light";
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { settings } = await adminApiService.getSettings();
      const branding = settings.filter((s) => s.key.startsWith("branding."));
      setSettings(branding);
      const id = branding.find((s) => s.key === "branding.identity");
      const col = branding.find((s) => s.key === "branding.colors");
      const colDark = branding.find((s) => s.key === "branding.colors_dark");
      const css = branding.find((s) => s.key === "branding.custom_css");
      const w = branding.find((s) => s.key === "branding.wording");
      const ft = branding.find((s) => s.key === "branding.font");
      const lg = branding.find((s) => s.key === "branding.logo");
      const fav = branding.find((s) => s.key === "branding.favicon");
      const lgDark = branding.find((s) => s.key === "branding.logo_dark");
      const favDark = branding.find((s) => s.key === "branding.favicon_dark");
      setIdentity(
        (id?.value as { title: string; tagline: string }) || {
          title: "DarkAuth",
          tagline: "",
        }
      );
      // Only keep the primary color from the loaded data
      const loadedColors = (col?.value as Record<string, string>) || {};
      const loadedColorsDark = (colDark?.value as Record<string, string>) || {};
      // Only extract the primary field
      const lightPrimary =
        typeof loadedColors === "object" && loadedColors.primary ? loadedColors.primary : "#6600cc";
      const darkPrimary =
        typeof loadedColorsDark === "object" && loadedColorsDark && loadedColorsDark.primary
          ? loadedColorsDark.primary
          : "#aec1e0";

      setColors({ primary: lightPrimary });
      setColorsDark({ primary: darkPrimary });
      setCustomCss((css?.value as string) || "");
      setWording((w?.value as Record<string, string>) || {});
      setFont(
        (ft?.value as { family: string; size: string; weight: Record<string, string> }) || null
      );
      setLogo(
        (lg?.value as { data: string | null; mimeType: string | null }) || {
          data: null,
          mimeType: null,
        }
      );
      setFavicon(
        (fav?.value as { data: string | null; mimeType: string | null }) || {
          data: null,
          mimeType: null,
        }
      );
      setLogoDark(
        (lgDark?.value as { data: string | null; mimeType: string | null }) || {
          data: null,
          mimeType: null,
        }
      );
      setFaviconDark(
        (favDark?.value as { data: string | null; mimeType: string | null }) || {
          data: null,
          mimeType: null,
        }
      );
      const ii = (id?.value as { title: string; tagline: string }) || {
        title: "DarkAuth",
        tagline: "",
      };
      setTitleInput(ii.title || "");
      setTaglineInput(ii.tagline || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load branding settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const url = buildPreviewUrl(issuer, {
      identity,
      colors: colors || {},
      colorsDark: colorsDark || {},
      wording,
      font,
      customCss,
      logo,
      logoDark,
      defaultTheme: previewTheme,
      themeMode: "inherit",
    });
    setPreviewUrl(url);
  }, [
    identity,
    colors,
    colorsDark,
    wording,
    font,
    customCss,
    logo,
    logoDark,
    previewTheme,
    issuer,
  ]);

  const saveAll = async () => {
    try {
      setSaving(true);
      const identityToSave = { title: titleInput, tagline: taglineInput };

      await adminApiService.updateSetting("branding.identity", identityToSave);
      if (colors) await adminApiService.updateSetting("branding.colors", colors);
      if (wording) await adminApiService.updateSetting("branding.wording", wording);
      if (font) await adminApiService.updateSetting("branding.font", font);
      await adminApiService.updateSetting("branding.custom_css", customCss || "");
      if (logo) await adminApiService.updateSetting("branding.logo", logo);
      if (logoDark) await adminApiService.updateSetting("branding.logo_dark", logoDark);
      if (favicon) await adminApiService.updateSetting("branding.favicon", favicon);
      if (faviconDark) await adminApiService.updateSetting("branding.favicon_dark", faviconDark);
      if (colorsDark && Object.keys(colorsDark).length > 0) {
        logger.info({ colorsDark }, "Saving dark theme colors");
        await adminApiService.updateSetting("branding.colors_dark", colorsDark);
      }
      toast({ title: "Branding saved" });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to save branding",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const sendTheme = () => {
      const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
      try {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "da:theme", theme },
          window.location.origin
        );
      } catch {}
    };
    sendTheme();
    const mo = new MutationObserver(sendTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  const onPickImage = async (
    file: File,
    setter: (v: { data: string; mimeType: string }) => void
  ) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image too large (max 2MB)", variant: "destructive" });
      return;
    }
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    setter({ data: b64, mimeType: file.type });
  };

  return (
    <div>
      <PageHeader
        title="Branding"
        subtitle="Customize logos, colors, text, and CSS"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" onClick={load}>
              Reload
            </Button>
            <Button onClick={saveAll} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                iframeRef.current?.contentWindow?.location.reload();
              }}
            >
              Reload Preview
            </Button>
          </div>
        }
      />

      {error && <div style={{ color: "red", margin: "16px 0" }}>{error}</div>}

      {loading ? (
        <div>Loading branding settings...</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(360px, 520px) 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 16 }}>
            <Card>
              <CardHeader>
                <CardTitle>Branding Area</CardTitle>
              </CardHeader>
              <CardContent style={{ display: "grid", gap: 16 }}>
                <div>
                  <Label>Brand color</Label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <ColorInput
                      value={String(colors?.primary || "#6600cc")}
                      onChange={(v) => {
                        setColors({ primary: v });
                      }}
                    />
                    <Input
                      value={String(colors?.primary || "#6600cc")}
                      onChange={(e) => {
                        setColors({ primary: e.target.value });
                      }}
                    />
                  </div>
                </div>

                <div>
                  <Label>Brand color (Dark)</Label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <ColorInput
                      value={String(colorsDark?.primary || "#aec1e0")}
                      onChange={(v) => {
                        setColorsDark({ primary: v });
                      }}
                    />
                    <Input
                      value={String(colorsDark?.primary || "#aec1e0")}
                      onChange={(e) => {
                        setColorsDark({ primary: e.target.value });
                      }}
                    />
                  </div>
                </div>

                <div>
                  <Label>Company logo</Label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <FileInput
                      accept="image/png,image/jpeg,image/svg+xml,image/x-icon"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onPickImage(f, (v) => setLogo(v));
                      }}
                    />
                    {logo?.data && (
                      <img
                        src={`data:${logo.mimeType};base64,${logo.data}`}
                        alt="Logo preview"
                        style={{ height: 36, width: "auto" }}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <Label>Company logo (Dark)</Label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <FileInput
                      accept="image/png,image/jpeg,image/svg+xml,image/x-icon"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onPickImage(f, (v) => setLogoDark(v));
                      }}
                    />
                    {logoDark?.data && (
                      <img
                        src={`data:${logoDark.mimeType};base64,${logoDark.data}`}
                        alt="Logo preview"
                        style={{ height: 36, width: "auto" }}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <Label>Favicon</Label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <FileInput
                      accept="image/png,image/jpeg,image/svg+xml,image/x-icon"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onPickImage(f, (v) => setFavicon(v));
                      }}
                    />
                  </div>
                </div>

                <div>
                  <Label>Favicon (Dark)</Label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <FileInput
                      accept="image/png,image/jpeg,image/svg+xml,image/x-icon"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onPickImage(f, (v) => setFaviconDark(v));
                      }}
                    />
                  </div>
                </div>

                <div>
                  <Label>Title</Label>
                  <Input
                    value={titleInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTitleInput(v);
                      if (titleTimer.current) window.clearTimeout(titleTimer.current);
                      titleTimer.current = window.setTimeout(() => {
                        setIdentity({
                          ...(identity || { title: "", tagline: taglineInput }),
                          title: v,
                        });
                      }, 200);
                    }}
                    onBlur={() => {
                      setIdentity({
                        ...(identity || { title: "", tagline: taglineInput }),
                        title: titleInput,
                      });
                    }}
                    style={{ marginTop: 8 }}
                  />
                </div>
                <div>
                  <Label>Tagline</Label>
                  <Input
                    value={taglineInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTaglineInput(v);
                      if (taglineTimer.current) window.clearTimeout(taglineTimer.current);
                      taglineTimer.current = window.setTimeout(() => {
                        setIdentity({
                          ...(identity || { title: titleInput, tagline: "" }),
                          tagline: v,
                        });
                      }, 200);
                    }}
                    onBlur={() => {
                      setIdentity({
                        ...(identity || { title: titleInput, tagline: "" }),
                        tagline: taglineInput,
                      });
                    }}
                    style={{ marginTop: 8 }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Custom UI</CardTitle>
              </CardHeader>
              <CardContent>
                <Label>Custom CSS</Label>
                <Textarea
                  rows={10}
                  value={customCss}
                  onChange={(e) => setCustomCss(e.target.value)}
                  placeholder={"/* Add CSS to style .da-* classes */"}
                  style={{ marginTop: 8 }}
                />
              </CardContent>
            </Card>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={load}>
                Reset
              </Button>
              <Button onClick={saveAll} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <CardTitle>Sign-in preview</CardTitle>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    variant={previewWidth === 420 ? "default" : "outline"}
                    onClick={() => setPreviewWidth(420)}
                    size="sm"
                  >
                    Mobile
                  </Button>
                  <Button
                    variant={previewWidth === 680 ? "default" : "outline"}
                    onClick={() => setPreviewWidth(680)}
                    size="sm"
                  >
                    Desktop
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <iframe
                  ref={iframeRef}
                  key={previewUrl}
                  title="Branding Preview"
                  src={previewUrl}
                  style={{
                    width: previewWidth,
                    height: 760,
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    background: "white",
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
