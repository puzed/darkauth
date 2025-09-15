import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
 
import { JSDOM } from 'jsdom';
import mermaid from 'mermaid';
import { Resvg } from '@resvg/resvg-js';
import { markdownFileToPdf } from '@DarkAuth/md-to-pdf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const repoRoot = resolve(__dirname, '../../..');
  const mdPath = resolve(repoRoot, 'specs/0_SECURITY_WHITEPAPER.md');
  const outDir = resolve(__dirname, '../public');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'whitepaper.pdf');

  let md = fs.readFileSync(mdPath, 'utf8');

  const jsdom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const { window } = jsdom;
  const { document } = window;
  globalThis.window = window;
  globalThis.document = document;
  if (!('navigator' in globalThis)) {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node.js' } });
  }
  try {
    const svgProto = window.SVGElement && window.SVGElement.prototype;
    if (svgProto && !svgProto.getBBox) {
      svgProto.getBBox = function () {
        const text = this.textContent || '';
        const width = Math.max(10, text.length * 7);
        const height = 16;
        return { x: 0, y: 0, width, height, left: 0, right: width, top: 0, bottom: height };
      };
    }
    const textProto = window.SVGTextElement && window.SVGTextElement.prototype;
    if (textProto && !textProto.getComputedTextLength) {
      textProto.getComputedTextLength = function () {
        const text = this.textContent || '';
        return Math.max(10, text.length * 7);
      };
    }
    if (!window.requestAnimationFrame) {
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    }
  } catch {}
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

  async function renderMermaidToPng(mermaidCode) {
    const id = 'mmd-' + Math.random().toString(36).slice(2);
    const { svg } = await mermaid.render(id, mermaidCode, document.body);
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1000 } });
    const pngData = resvg.render().asPng();
    return `data:image/png;base64,${Buffer.from(pngData).toString('base64')}`;
  }

  const mermaidFence = /```mermaid\n([\s\S]*?)```/g;
  const replacements = [];
  let match;
  while ((match = mermaidFence.exec(md)) !== null) {
    replacements.push({ index: match.index, length: match[0].length, code: match[1] });
  }
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    let replacementHtml;
    try {
      const dataUrl = await renderMermaidToPng(r.code);
      replacementHtml = `\n\n<img alt="diagram" src="${dataUrl}" style="max-width:100%;" />\n\n`;
    } catch (e) {
      const safe = r.code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      replacementHtml = `\n\n<pre><code>Mermaid diagram could not be rendered in this environment.\n\n${safe}</code></pre>\n\n`;
    }
    md = md.slice(0, r.index) + replacementHtml + md.slice(r.index + r.length);
  }

  

  const tempMdPath = join(outDir, 'whitepaper.generated.md');
  const header = `# DarkAuth v1 Security Whitepaper\n\nA technical analysis of zero‑knowledge key delivery for OIDC\n\n_${new Date().toISOString().slice(0, 10)}_\n\n`;
  const combined = header + md;
  fs.writeFileSync(tempMdPath, combined, 'utf8');
  const css = [
    'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#111;padding:24px}',
    'h1{font-size:26px;margin:0 0 8px 0}',
    'h2{font-size:20px;margin:20px 0 8px 0}',
    'h3{font-size:16px;margin:16px 0 6px 0}',
    'p,li{font-size:12px}',
    'pre{background:#f6f8fa;padding:10px;border-radius:6px;overflow:auto}',
    'code{background:#f6f8fa;padding:2px 4px;border-radius:4px}',
    'img{max-width:100%;display:block;margin:8px auto}'
  ].join('');
  await markdownFileToPdf(tempMdPath, outPath, {
    css,
    format: 'A4',
    margin: { top: '20mm', right: '16mm', bottom: '20mm', left: '16mm' },
    displayHeaderFooter: true,
    headerTemplate: '<style>section{font-size:8px;color:#666;width:100%;padding:0 16mm}</style><section></section>',
    footerTemplate: '<style>section{font-size:8px;color:#666;width:100%;padding:0 16mm;display:flex;justify-content:flex-end}</style><section><span class="pageNumber"></span> / <span class="totalPages"></span></section>'
  });
  console.log(`Whitepaper PDF generated at ${outPath}`);
}

main().catch((e) => {
  console.error('Failed to generate whitepaper PDF:', e);
  process.exit(0);
});
