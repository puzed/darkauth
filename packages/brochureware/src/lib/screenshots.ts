export type ScreenshotTheme = "dark" | "light";

export type Shot = {
  file: string;
  scenario: string;
  step: number;
  title: string;
  group1?: string;
  group2?: string;
  feature?: string;
};

export type ScreenshotManifest = {
  themes?: Partial<Record<ScreenshotTheme, Shot[]>>;
};

const LOCAL_SCREENSHOTS = import.meta.env.DEV;

export const SCREENSHOT_MANIFEST_URL = LOCAL_SCREENSHOTS
  ? "/test-screenshots/screenshots.json"
  : "https://release.darkauth.com/screenshots.json";
export const SCREENSHOT_BASE_URL = LOCAL_SCREENSHOTS
  ? "/test-screenshots"
  : "https://release.darkauth.com/screenshots";

export const getScreenshotUrl = (theme: ScreenshotTheme, file: string) => `${SCREENSHOT_BASE_URL}/${theme}/${file}`;

export const cleanShotTitle = (title: string) => title.replace(/\s#\d+$/, "").replace(/\sChrome$/i, "").trim();

export const findAdminDashboardShot = (shots: Shot[]) =>
  shots.find((shot) => shot.group1 === "Admin" && shot.group2 === "Dashboard")
  ?? shots.find((shot) => shot.scenario.includes("admin-dashboard"))
  ?? shots.find((shot) => shot.group1 === "Admin")
  ?? shots[0];

export const getFeaturedShots = (shots: Shot[]) => {
  const targets = [
    ["Admin", "Dashboard"],
    ["Admin", "Branding"],
    ["Admin", "Users"],
    ["Auth", "User"],
    ["Demo", "Demo"],
    ["User", "Auth"],
  ];
  const chosen: Shot[] = [];

  for (const [group1, group2] of targets) {
    const match = shots.find((shot) => shot.group1 === group1 && shot.group2 === group2);
    if (match && !chosen.some((shot) => shot.file === match.file)) {
      chosen.push(match);
    }
  }

  for (const shot of shots) {
    if (chosen.length >= 6) break;
    if (!chosen.some((candidate) => candidate.file === shot.file)) {
      chosen.push(shot);
    }
  }

  return chosen;
};
