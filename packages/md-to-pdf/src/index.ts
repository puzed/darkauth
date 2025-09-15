import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import MarkdownIt from "markdown-it";
import puppeteer, { type PaperFormat } from "puppeteer";

export type MarkdownToPdfOptions = {
  css?: string;
  format?: PaperFormat;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
};

export async function markdownFileToPdf(inputPath: string, outputPath: string, options: MarkdownToPdfOptions = {}) {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  const markdown = await readFile(inputPath, "utf8");
  const htmlBody = md.render(markdown);
  const title = basename(inputPath);
  const css = options.css || "body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;padding:24px;color:#111}h1,h2,h3{margin-top:1.5em}pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto}code{background:#f6f8fa;padding:2px 4px;border-radius:4px}img{max-width:100%}";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body>${htmlBody}</body></html>`;
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: outputPath,
      format: options.format ?? "A4",
      margin: {
        top: options.margin?.top || "20mm",
        right: options.margin?.right || "16mm",
        bottom: options.margin?.bottom || "20mm",
        left: options.margin?.left || "16mm"
      },
      displayHeaderFooter: options.displayHeaderFooter || false,
      headerTemplate: options.headerTemplate || "",
      footerTemplate: options.footerTemplate || ""
    });
  } finally {
    await browser.close();
  }
}

export default markdownFileToPdf;
