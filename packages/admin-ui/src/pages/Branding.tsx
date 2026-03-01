import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorInput } from "@/components/ui/color-input";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import adminApiService from "@/services/api";

declare global {
  interface Window {
    __APP_CONFIG__?: { issuer?: string };
  }
}

type ThemeMode = "light" | "dark";
type BrandingImage = { data: string | null; mimeType: string | null };
type BrandingIdentity = { title: string; tagline: string };

const colorFields = [
  { key: "brandColor", label: "Brand Color" },
  { key: "primaryForegroundColor", label: "Primary Foreground Color" },
  { key: "primaryBackgroundColor", label: "Primary Background Color" },
  { key: "backgroundColor", label: "Dark Color" },
  { key: "textColor", label: "Text Color" },
] as const;

const defaultLightColors: Record<string, string> = {
  brandColor: "#6600cc",
  primaryForegroundColor: "#ffffff",
  primaryBackgroundColor: "#6600cc",
  backgroundColor: "#f3f4f6",
  textColor: "#111827",
};

const defaultDarkColors: Record<string, string> = {
  brandColor: "#aec1e0",
  primaryForegroundColor: "#1f2937",
  primaryBackgroundColor: "#c5d3e8",
  backgroundColor: "#0f172a",
  textColor: "#f8fafc",
};

function normalizeColors(colors: Record<string, string> | undefined, mode: ThemeMode) {
  const defaults = mode === "dark" ? defaultDarkColors : defaultLightColors;
  const c = colors || {};
  return {
    brandColor: c.brandColor || defaults.brandColor,
    primaryForegroundColor: c.primaryForegroundColor || defaults.primaryForegroundColor,
    primaryBackgroundColor: c.primaryBackgroundColor || defaults.primaryBackgroundColor,
    backgroundColor: c.backgroundColor || defaults.backgroundColor,
    textColor: c.textColor || defaults.textColor,
  };
}

function buildPreviewUrl(issuer: string, cacheBust: string) {
  const u = encodeURIComponent(issuer);
  return `/branding/preview.html?u=${u}&da_preview=1&v=${encodeURIComponent(cacheBust)}`;
}

function normalizeImage(value: unknown): BrandingImage {
  const v = value as BrandingImage | null | undefined;
  return { data: v?.data || null, mimeType: v?.mimeType || null };
}

function cloneImage(value: BrandingImage): BrandingImage {
  return { data: value.data, mimeType: value.mimeType };
}

function getDefaultLogoSvg(color: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width="100%" height="100%" viewBox="0 0 874 874" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
  <g id="_-f2aa4eff" serif:id="#f2aa4eff" transform="matrix(1,0,0,1,91,0)">
    <path d="M271.82,117.74C319.37,98.76 374.07,98.81 421.82,117.11C457.72,131.19 489.81,155.16 513.12,185.9C535.81,215.21 549.33,251.2 552.63,288.04C553.81,310.01 552.3,332.03 553.09,354.02C552.82,357.63 557.88,357.45 560,358.12C581.67,362.57 602.58,374.3 614.92,393.05C626.53,408.44 630.61,428.07 630.99,446.98C631.25,472.55 630.95,498.13 630.51,523.71C621.99,517.55 616.01,508.7 608.7,501.3C606.1,498.29 602.69,495.55 601.61,491.56C599.69,471.66 602.38,451.59 600.18,431.71C597.1,414.47 585.32,398.75 569.19,391.68C559.07,387.34 547.83,387.09 537.01,386.98C410.34,387 283.66,387.04 156.99,386.96C146.46,387.32 135.22,386.51 125.5,391.36C111.82,397.13 100.96,409.06 96.11,423.03C90.21,442.77 94.17,463.8 93.07,484.05C94.48,491.01 89.22,496.27 85.03,501.02C77.73,508.15 70.9,515.76 63.38,522.67C62.64,497.45 63.12,472.22 62.93,446.99C62.15,426.67 68.08,405.88 80.83,389.86C95.13,370.94 117.76,360.23 140.76,356.53C140.14,332.69 139.4,308.81 141.31,285C149.31,210.73 202.72,144.76 271.82,117.74M247.01,164.03C226.02,177.98 208.69,196.93 195.17,218.11C176.56,247.71 167.88,283.11 169.38,317.96C170.04,330.62 170.06,343.31 170.05,355.99C187.04,356.02 204.02,356.02 221.01,355.99C221.06,339.33 220.6,322.67 221.36,306.03C223.06,275.06 235.92,244.85 257.48,222.49C274.26,206.14 295.08,193.49 318.03,188.16C332.71,184.5 348.02,184.99 362.96,186.37C388.84,188.39 413.13,200.53 432.25,217.75C451.66,235.46 464.79,259.59 470.82,285.05C475.19,308.3 473.4,332.17 473.46,355.71C490.63,356.17 507.81,356.03 524.99,355.99C524.87,338.32 525.31,320.64 524.96,302.98C523.85,266.77 510.73,231.16 488.3,202.72C454.33,157.93 398.34,130.7 342.06,132.52C308.31,134.13 274.61,144.22 247.01,164.03M298.83,227.83C280.28,238.63 265.77,255.9 257.87,275.81C247.34,301.17 251.96,329.34 251.01,355.99C315.24,355.81 379.48,356.41 443.71,355.69C444.07,337.15 445.9,318.47 442.91,300.03C439.96,275.06 426.71,251.59 406.95,236.06C390.24,221.57 367.94,214.57 346.03,214.55C329.75,215.98 312.76,218.65 298.83,227.83Z" style="fill:${color};fill-rule:nonzero;"/>
    <path d="M285.55,415.47C290.99,413.09 297.7,410.58 303.46,413.39C310.84,416.36 314.57,424.42 316.3,431.7C318.07,437.5 316.32,444.62 310.88,447.83C280,470.73 251.16,496.19 221.14,520.17C214.72,526.03 206.08,530.91 204.09,540.15C208.42,542.47 213.93,543.66 217.92,539.94C249.05,514.41 280,488.63 311.31,463.32C316.33,459.63 323.03,459.62 328.98,460.03C339.71,463.68 347.97,475.21 344.62,486.8C342.29,494.74 336.12,500.75 329.99,505.99C316.17,517.16 302.14,528.07 288.63,539.62C271.79,553.25 254.32,566.17 238.56,581.07C240.16,583.66 241.8,586.23 243.43,588.8C255.26,585.7 263.67,576.26 273.02,569.02C287.41,557.47 300.91,544.86 315.3,533.31C320.37,528.82 327.29,527.13 333.99,527.96C341.44,529.86 345.97,537.82 344.14,545.19C341.25,557.17 331.05,565.37 322.74,573.73C304.17,589.85 285.33,605.66 266.64,621.64C249.65,636.58 232.5,652.21 211.53,661.37C196.48,667.38 178.746,665.629 164.57,673.38C148.287,682.283 119.1,705.3 113.83,714.79C110.69,721.54 109.83,729.96 113.34,736.73C119.88,750.82 133.23,759.9 146.98,766.05C159.56,771.5 173.24,774.4 186.98,774.02C291.99,774.03 397,773.9 502.01,774.08C524.26,774.84 546.87,768.13 564.58,754.53C570.66,749.93 575.86,744.01 579.23,737.15C583.49,726.9 580.09,714.41 572.97,707.03C562.565,696.245 535.06,676.55 516.8,672.44C491.15,667.69 467.41,655.22 447.59,638.43C419.75,614.98 390.82,592.7 364.72,567.28C357.04,559.19 347.12,549.77 349.47,537.48C353.65,526.51 368.72,524.77 376.9,532.15C390.7,542.52 403.37,554.35 416.65,565.38C426.3,573.11 435.16,582 446.23,587.79C450.7,588.71 452.97,584.64 455.65,582.09C446.01,571.05 433.74,562.85 422.71,553.32C408.62,541.71 394.47,530.17 380.31,518.66C369.28,509.6 355.59,502.02 349.88,488.19C343.94,473.9 358.01,457.14 373.01,459.9C378.31,459.79 382.52,463.55 386.53,466.48C415.48,489.43 443.39,513.65 471.85,537.19C475.25,539.79 479.4,544.19 484.17,542.31C487.52,541.48 488.64,536.89 486.81,534.21C483.9,529.54 479.33,526.29 475.24,522.75C444.24,497.34 413.95,471.02 381.56,447.37C373.3,440.85 375.57,428.56 381.2,421.13C384.54,414.99 391.73,411.57 398.62,412.56C405.35,413.79 411.32,417.36 416.99,421.01C432.94,432.15 447.06,445.58 462.06,457.92C478.32,471.32 494.34,484.99 510.43,498.59C516.83,504.08 523.07,510.23 531.21,513.09C532.43,510.14 534.75,507.49 535.01,504.22C529.58,496.95 522.41,491.27 515.62,485.35C501.7,472.57 487.46,460.13 473.01,447.96C467.47,443.38 461.5,435.99 464.13,428.3C465.23,423.17 468.95,418.2 474.43,417.46C485.98,414.97 495.42,423.71 503.92,430.1C533.78,453.99 562.68,479.2 589.14,506.85C608.63,528.37 627.18,551.67 638.07,578.84C645.92,598.24 650.84,619.01 651.02,640C650.68,687.89 628.25,734.85 591.97,765.96C567.93,785.59 537.61,799.51 506.01,798.08C399.34,797.95 292.67,797.95 186,798.07C158.06,799.49 130.96,788.24 108.37,772.55C60.26,737.09 33.25,674.23 42.92,614.95C49.05,579.38 68.58,547.74 91.59,520.56C121,486.9 155.24,457.94 189.96,429.95C198.44,423.67 207.93,414.99 219.42,417.45C230.7,420.19 232.55,437.06 224.11,444.11C203.98,461.63 183.81,479.14 163.91,496.94C161.31,500.17 156.49,503 156.96,507.77C158.26,508.85 160.86,511.02 162.16,512.11C166.23,512.03 169.17,508.55 172.39,506.44C196.72,485.71 221.37,465.33 246.25,445.26C258.94,434.82 271.12,423.53 285.55,415.47Z" style="fill:${color};fill-rule:nonzero;"/>
    <path d="M309.14,638.07C320.1,617.56 349.23,609.73 368.94,622.13C386.77,630.88 394.28,654.06 387.24,672.16C382.94,681.97 374.4,689.2 365.07,694.1C365.03,704.35 365.51,714.63 364.65,724.87C361.3,740.09 337.58,743.01 330.39,729.51C325.43,718.77 329.9,706.18 327.86,694.95C319.72,688.15 309.9,682.14 306.35,671.49C303.25,660.65 302.52,647.79 309.14,638.07Z" style="fill:${color};fill-rule:nonzero;"/>
  </g>
</svg>`;
}

function toDataSvg(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function Branding() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [activeMode, setActiveMode] = useState<ThemeMode>(() => {
    const mode = new URL(window.location.href).searchParams.get("mode");
    return mode === "dark" ? "dark" : "light";
  });
  const [identity, setIdentity] = useState<BrandingIdentity>({ title: "", tagline: "" });
  const [colorsLight, setColorsLight] = useState<Record<string, string>>(defaultLightColors);
  const [colorsDark, setColorsDark] = useState<Record<string, string>>(defaultDarkColors);
  const [logoLight, setLogoLight] = useState<BrandingImage>({ data: null, mimeType: null });
  const [logoDark, setLogoDark] = useState<BrandingImage>({ data: null, mimeType: null });
  const [faviconLight, setFaviconLight] = useState<BrandingImage>({ data: null, mimeType: null });
  const [faviconDark, setFaviconDark] = useState<BrandingImage>({ data: null, mimeType: null });
  const [customCss, setCustomCss] = useState("");
  const [wording, setWording] = useState<Record<string, string>>({});
  const [font, setFont] = useState<{
    family: string;
    size: string;
    weight: Record<string, string>;
  } | null>(null);

  const [previewWidth, setPreviewWidth] = useState<number>(420);
  const [previewUrl, setPreviewUrl] = useState("");
  const previewCacheBustRef = useRef<string>(`${Date.now()}`);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const issuer = window.__APP_CONFIG__?.issuer || "http://localhost:9080";
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { settings } = await adminApiService.getSettings();
      const branding = new Map(
        settings.filter((s) => s.key.startsWith("branding.")).map((s) => [s.key, s.value])
      );

      const loadedIdentity = (branding.get("branding.identity") as
        | BrandingIdentity
        | undefined) || {
        title: "",
        tagline: "",
      };
      const loadedLight =
        (branding.get("branding.colors") as Record<string, string> | undefined) || {};
      const loadedDark =
        (branding.get("branding.colors_dark") as Record<string, string> | undefined) || {};

      setIdentity({ title: loadedIdentity.title || "", tagline: loadedIdentity.tagline || "" });
      setColorsLight(normalizeColors(loadedLight, "light"));
      setColorsDark(normalizeColors(loadedDark, "dark"));
      setLogoLight(normalizeImage(branding.get("branding.logo")));
      setLogoDark(normalizeImage(branding.get("branding.logo_dark")));
      setFaviconLight(normalizeImage(branding.get("branding.favicon")));
      setFaviconDark(normalizeImage(branding.get("branding.favicon_dark")));
      setCustomCss((branding.get("branding.custom_css") as string) || "");
      setWording((branding.get("branding.wording") as Record<string, string>) || {});
      setFont(
        (branding.get("branding.font") as {
          family: string;
          size: string;
          weight: Record<string, string>;
        }) || null
      );
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
    setPreviewUrl(buildPreviewUrl(issuer, previewCacheBustRef.current));
  }, [issuer]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", activeMode);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [activeMode]);

  const previewPayload = useMemo(() => {
    const lightFallbackLogo = toDataSvg(getDefaultLogoSvg(colorsLight.brandColor || "#6600cc"));
    const darkFallbackLogo = toDataSvg(getDefaultLogoSvg(colorsDark.brandColor || "#aec1e0"));
    const lightLogoUrl =
      logoLight.data && logoLight.mimeType
        ? `data:${logoLight.mimeType};base64,${logoLight.data}`
        : lightFallbackLogo;
    const darkLogoUrl =
      logoDark.data && logoDark.mimeType
        ? `data:${logoDark.mimeType};base64,${logoDark.data}`
        : darkFallbackLogo;
    const lightFaviconUrl =
      faviconLight.data && faviconLight.mimeType
        ? `data:${faviconLight.mimeType};base64,${faviconLight.data}`
        : null;
    const darkFaviconUrl =
      faviconDark.data && faviconDark.mimeType
        ? `data:${faviconDark.mimeType};base64,${faviconDark.data}`
        : null;
    return {
      branding: {
        identity,
        colors: colorsLight,
        colorsDark,
        wording,
        font,
        customCSS: customCss,
        logoUrl: lightLogoUrl,
        logoUrlDark: darkLogoUrl,
        ...(lightFaviconUrl ? { faviconUrl: lightFaviconUrl } : {}),
        ...(darkFaviconUrl ? { faviconUrlDark: darkFaviconUrl } : {}),
      },
      defaultTheme: activeMode,
      theme: activeMode,
      themeMode: "inherit" as const,
    };
  }, [
    activeMode,
    identity,
    colorsLight,
    colorsDark,
    wording,
    font,
    customCss,
    logoLight,
    logoDark,
    faviconLight,
    faviconDark,
  ]);

  useEffect(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "da:theme", theme: activeMode },
        window.location.origin
      );
    } catch {
      return;
    }
  }, [activeMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "da:branding", payload: previewPayload },
          window.location.origin
        );
      } catch {
        return;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [previewPayload]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: string; theme?: unknown } | null;
      if (!data || data.type !== "da:theme-changed") return;
      if (data.theme === "light" || data.theme === "dark") setActiveMode(data.theme);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const onPickImage = async (file: File, setter: (value: BrandingImage) => void) => {
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image too large (max 2MB)", variant: "destructive" });
      return;
    }
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    setter({ data: b64, mimeType: file.type });
  };

  const copyCurrentToOther = () => {
    if (activeMode === "light") {
      setColorsDark({ ...colorsLight });
      setLogoDark(cloneImage(logoLight));
      setFaviconDark(cloneImage(faviconLight));
      toast({ title: "Copied light mode values to dark mode" });
      return;
    }
    setColorsLight({ ...colorsDark });
    setLogoLight(cloneImage(logoDark));
    setFaviconLight(cloneImage(faviconDark));
    toast({ title: "Copied dark mode values to light mode" });
  };

  const saveAll = async () => {
    try {
      setSaving(true);
      await adminApiService.updateSetting("branding.identity", identity);
      await adminApiService.updateSetting("branding.colors", colorsLight);
      await adminApiService.updateSetting("branding.colors_dark", colorsDark);
      await adminApiService.updateSetting("branding.custom_css", customCss);
      await adminApiService.updateSetting("branding.logo", logoLight);
      await adminApiService.updateSetting("branding.logo_dark", logoDark);
      await adminApiService.updateSetting("branding.favicon", faviconLight);
      await adminApiService.updateSetting("branding.favicon_dark", faviconDark);
      if (Object.keys(wording).length)
        await adminApiService.updateSetting("branding.wording", wording);
      if (font) await adminApiService.updateSetting("branding.font", font);
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

  const lightColorValues = colorsLight;
  const darkColorValues = colorsDark;
  const lightLogo = logoLight;
  const darkLogo = logoDark;
  const lightFavicon = faviconLight;
  const darkFavicon = faviconDark;

  const renderThemeFields = (
    mode: ThemeMode,
    colorValues: Record<string, string>,
    setColors: Dispatch<SetStateAction<Record<string, string>>>,
    logo: BrandingImage,
    setLogo: Dispatch<SetStateAction<BrandingImage>>,
    favicon: BrandingImage,
    setFavicon: Dispatch<SetStateAction<BrandingImage>>
  ) => (
    <div style={{ display: "grid", gap: 16 }}>
      {colorFields.map((field) => (
        <div key={`${mode}-${field.key}`}>
          <Label>{field.label}</Label>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <ColorInput
              value={String(colorValues[field.key] || "")}
              onChange={(v) => setColors((prev) => ({ ...prev, [field.key]: v }))}
            />
            <Input
              value={String(colorValues[field.key] || "")}
              onChange={(e) => setColors((prev) => ({ ...prev, [field.key]: e.target.value }))}
            />
          </div>
        </div>
      ))}

      <div>
        <Label>Logo</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <FileInput
            accept="image/png,image/jpeg,image/svg+xml,image/x-icon"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickImage(f, setLogo);
            }}
          />
          <Button
            variant="outline"
            type="button"
            disabled={!logo.data || !logo.mimeType}
            onClick={() => setLogo({ data: null, mimeType: null })}
          >
            Remove
          </Button>
          <div
            style={{
              width: 96,
              minWidth: 96,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
            }}
          >
            {logo.data && logo.mimeType ? (
              <img
                src={`data:${logo.mimeType};base64,${logo.data}`}
                alt="Logo preview"
                style={{ height: 36, width: "auto" }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <Label>Favicon</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <FileInput
            accept="image/png,image/jpeg,image/svg+xml,image/x-icon"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickImage(f, setFavicon);
            }}
          />
          <Button
            variant="outline"
            type="button"
            disabled={!favicon.data || !favicon.mimeType}
            onClick={() => setFavicon({ data: null, mimeType: null })}
          >
            Remove
          </Button>
          <div
            style={{
              width: 96,
              minWidth: 96,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
            }}
          >
            {favicon.data && favicon.mimeType ? (
              <img
                src={`data:${favicon.mimeType};base64,${favicon.data}`}
                alt="Favicon preview"
                style={{ height: 24, width: 24 }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Branding"
        subtitle="Customize logos, colors, text, and CSS"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={saveAll} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      />

      {error ? <div style={{ color: "red", margin: "16px 0" }}>{error}</div> : null}

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
                <Tabs value={activeMode} onValueChange={(v) => setActiveMode(v as ThemeMode)}>
                  <TabsList>
                    <TabsTrigger value="light">Light</TabsTrigger>
                    <TabsTrigger value="dark">Dark</TabsTrigger>
                  </TabsList>

                  <TabsContent value="light">
                    {renderThemeFields(
                      "light",
                      lightColorValues,
                      setColorsLight,
                      lightLogo,
                      setLogoLight,
                      lightFavicon,
                      setFaviconLight
                    )}
                  </TabsContent>

                  <TabsContent value="dark">
                    {renderThemeFields(
                      "dark",
                      darkColorValues,
                      setColorsDark,
                      darkLogo,
                      setLogoDark,
                      darkFavicon,
                      setFaviconDark
                    )}
                  </TabsContent>
                </Tabs>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button variant="outline" onClick={copyCurrentToOther}>
                    {activeMode === "light" ? "Copy Light To Dark" : "Copy Dark To Light"}
                  </Button>
                </div>

                <div>
                  <Label>Title</Label>
                  <Input
                    value={identity.title}
                    onChange={(e) => setIdentity((prev) => ({ ...prev, title: e.target.value }))}
                    style={{ marginTop: 8 }}
                  />
                </div>

                <div>
                  <Label>Tagline</Label>
                  <Input
                    value={identity.tagline}
                    onChange={(e) => setIdentity((prev) => ({ ...prev, tagline: e.target.value }))}
                    style={{ marginTop: 8 }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Custom CSS</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={10}
                  value={customCss}
                  onChange={(e) => setCustomCss(e.target.value)}
                  placeholder=""
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
                  title="Branding Preview"
                  src={previewUrl}
                  onLoad={() => {
                    try {
                      iframeRef.current?.contentWindow?.postMessage(
                        { type: "da:theme", theme: activeMode },
                        window.location.origin
                      );
                      iframeRef.current?.contentWindow?.postMessage(
                        { type: "da:branding", payload: previewPayload },
                        window.location.origin
                      );
                    } catch {
                      return;
                    }
                  }}
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
