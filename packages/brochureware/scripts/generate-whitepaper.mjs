import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { JSDOM } from 'jsdom';
import htmlToPdfmake from 'html-to-pdfmake';
import PdfPrinter from 'pdfmake';
import mermaid from 'mermaid';
import { Resvg } from '@resvg/resvg-js';

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

  const mdParser = new MarkdownIt({ html: true, linkify: true, breaks: true });
  const htmlBody = mdParser.render(md);

  const conversionWindow = new JSDOM('<!doctype html><html><body></body></html>').window;
  const pdfmakeContent = htmlToPdfmake(htmlBody, {
    window: conversionWindow,
    defaultStyles: {
      h1: { fontSize: 20, bold: true, margin: [0, 8, 0, 8] },
      h2: { fontSize: 16, bold: true, margin: [0, 8, 0, 6] },
      h3: { fontSize: 13, bold: true, margin: [0, 6, 0, 4] },
      p: { fontSize: 11, margin: [0, 2, 0, 4] },
      code: { fontSize: 9, background: '#f6f6f6' },
      pre: { fontSize: 9, background: '#f6f6f6', margin: [0, 4, 0, 4] },
      li: { fontSize: 11, margin: [0, 1, 0, 1] },
      table: { margin: [0, 6, 0, 6] },
      th: { bold: true, fillColor: '#efefef' },
      td: {},
    }
  });

  function constrainImages(node) {
    if (Array.isArray(node)) return node.map(constrainImages);
    if (node && typeof node === 'object') {
      if (node.image && typeof node.image === 'string' && node.image.startsWith('data:image')) {
        node.fit = [500, 320];
        node.alignment = node.alignment || 'center';
        node.margin = node.margin || [0, 6, 0, 10];
      }
      for (const key of Object.keys(node)) node[key] = constrainImages(node[key]);
    }
    return node;
  }
  const constrainedContent = constrainImages(pdfmakeContent);

  function findFont(rel) {
    const candidates = [
      path.resolve(__dirname, '../node_modules/roboto-font/fonts/Roboto', rel),
      path.resolve(__dirname, '../../node_modules/roboto-font/fonts/Roboto', rel),
      path.resolve(__dirname, '../../../node_modules/roboto-font/fonts/Roboto', rel),
      path.resolve(process.cwd(), 'node_modules/roboto-font/fonts/Roboto', rel),
      path.resolve(process.cwd(), '../../node_modules/roboto-font/fonts/Roboto', rel),
      path.resolve(process.cwd(), '../../../node_modules/roboto-font/fonts/Roboto', rel),
    ];
    for (const p of candidates) {
      try { if (fs.existsSync(p)) return p; } catch {}
    }
    return null;
  }
  const fonts = {
    Roboto: {
      normal: findFont('roboto-regular-webfont.ttf') || findFont('Roboto-Regular.ttf') || '',
      bold: findFont('roboto-bold-webfont.ttf') || findFont('Roboto-Bold.ttf') || '',
      italics: findFont('roboto-italic-webfont.ttf') || findFont('Roboto-Italic.ttf') || '',
      bolditalics: findFont('roboto-bolditalic-webfont.ttf') || findFont('Roboto-BoldItalic.ttf') || '',
    },
  };
  if (!fonts.Roboto.normal) {
    throw new Error('Roboto TTF fonts not found in node_modules/roboto-font');
  }

  const printer = new PdfPrinter(fonts);
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    footer: function(currentPage, pageCount) {
      return { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', margin: [0, 10, 20, 0], fontSize: 8 };
    },
    styles: {},
    content: [
      { text: 'DarkAuth v1 Security Whitepaper', fontSize: 22, bold: true, margin: [0, 0, 0, 8] },
      { text: 'A technical analysis of zero‑knowledge key delivery for OIDC', italics: true, margin: [0, 0, 0, 16] },
      { text: new Date().toISOString().slice(0, 10), fontSize: 9, margin: [0, 0, 0, 24] },
      constrainedContent,
    ],
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const stream = fs.createWriteStream(outPath);
  pdfDoc.pipe(stream);
  pdfDoc.end();
  await new Promise((resolve) => stream.on('finish', resolve));
  console.log(`Whitepaper PDF generated at ${outPath}`);
}

main().catch((e) => {
  console.error('Failed to generate whitepaper PDF:', e);
  process.exit(0);
});
