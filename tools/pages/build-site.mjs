// Builds the published report site (PLS-29.2): an index page linking every report tools/pages/collect.sh found, plus the Markdown
// reports (traceability, security, the nightly sweep) as HTML. Reports that are missing are listed as "not yet run", not hidden.
//
//   node tools/pages/build-site.mjs <site dir> [<run URL of this build>]
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const [site, buildUrl] = process.argv.slice(2);
if (!site) throw new Error('Usage: node build-site.mjs <site dir> [run url]');
const runs = fs.existsSync(path.join(site, 'runs.json')) ? JSON.parse(fs.readFileSync(path.join(site, 'runs.json'), 'utf8')) : [];
const sha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STYLE = `
:root{color-scheme:light dark;--fg:#1c2330;--bg:#fff;--muted:#5b6678;--line:#dde2ea;--accent:#2457c5}
@media (prefers-color-scheme:dark){:root{--fg:#e6e9ef;--bg:#12161d;--muted:#9aa4b5;--line:#2a3140;--accent:#7aa2ff}}
body{font:16px/1.55 system-ui,sans-serif;color:var(--fg);background:var(--bg);margin:0 auto;max-width:62rem;padding:2rem 1rem}
h1{margin-top:0}a{color:var(--accent)}table{border-collapse:collapse;width:100%;font-size:15px;display:block;overflow-x:auto}
td,th{padding:.4rem .7rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.muted{color:var(--muted)}
code{font-size:.9em}pre{overflow-x:auto}`;
const page = (title, body) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style><body>${body}</body></html>`;

/** Every Markdown file the reports include, rendered next to itself as .html. */
const rendered = [];
function renderMarkdown(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) renderMarkdown(full);
    else if (entry.name.endsWith('.md')) {
      const html = full.replace(/\.md$/, '.html');
      if (fs.existsSync(html)) continue; // ZAP already wrote its own HTML
      const title = entry.name.replace(/\.md$/, '');
      fs.writeFileSync(
        html,
        page(
          title,
          `<p><a href="${path.relative(path.dirname(html), path.join(site, 'index.html'))}">All reports</a></p>${marked.parse(fs.readFileSync(full, 'utf8'))}`,
        ),
      );
      rendered.push(path.relative(site, html));
    }
  }
}
renderMarkdown(site);

const exists = (rel) => fs.existsSync(path.join(site, rel));
const listHtml = (dir, test) => {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (test(path.relative(site, full))) out.push(path.relative(site, full));
    }
  };
  walk(path.join(site, dir));
  return out.sort();
};

const SECTIONS = [
  {
    title: 'Traceability',
    note: 'Every acceptance criterion, the tools that cover it, the last result, and the defects each passing test catches.',
    links: () => (exists('traceability.html') ? ['traceability.html'] : []),
  },
  {
    title: 'Playwright (TypeScript)',
    section: 'playwright',
    links: () => listHtml('playwright', (f) => /playwright-report\/index\.html$/.test(f)),
  },
  { title: 'Newman (Postman)', section: 'newman', links: () => listHtml('newman', (f) => f.endsWith('.html')) },
  { title: 'Karate', section: 'karate', links: () => listHtml('karate', (f) => f.endsWith('karate-summary.html')) },
  { title: 'REST Assured', section: 'rest-assured', note: 'JUnit XML only.', links: () => [] },
  {
    title: 'Contract checks (Schemathesis)',
    section: 'contract',
    note: 'JUnit XML only. Spectral, oasdiff and Pact report in the pull request.',
    links: () => [],
  },
  {
    title: 'Security: OWASP API Top 10',
    section: 'security',
    links: () => listHtml('security', (f) => f.endsWith('security-report.html')),
  },
  { title: 'Security: ZAP scans', section: 'zap', links: () => listHtml('zap', (f) => /(baseline|api)\.html$/.test(f)) },
  { title: 'Load: k6', section: 'k6', links: () => listHtml('k6', (f) => f.endsWith('.html')) },
  { title: 'Load: JMeter', section: 'jmeter', links: () => listHtml('jmeter', (f) => /dashboard\/index\.html$/.test(f)) },
  { title: 'Nightly defect sweep', section: 'nightly', links: () => listHtml('nightly', (f) => f.endsWith('.html')) },
];

const rows = SECTIONS.map((s) => {
  const run = runs.find((r) => r.section === s.section);
  const links = s.links();
  const body = links.length
    ? links
        .map(
          (l) =>
            `<a href="${esc(l)}">${esc(path.basename(l, '.html') === 'index' ? path.basename(path.dirname(l)) : path.basename(l, '.html'))}</a>`,
        )
        .join(', ')
    : s.note
      ? `<span class="muted">${esc(s.note)}</span>`
      : '<span class="muted">not yet run on main</span>';
  const from = run
    ? `<a href="${esc(run.url)}">${esc(run.created.slice(0, 16).replace('T', ' '))}</a> <code>${esc(run.sha.slice(0, 7))}</code>`
    : '';
  return `<tr><td><strong>${esc(s.title)}</strong>${s.note && links.length ? `<br><span class="muted">${esc(s.note)}</span>` : ''}</td><td>${body}</td><td>${from}</td></tr>`;
}).join('\n');

fs.writeFileSync(
  path.join(site, 'index.html'),
  page(
    'PlayLab test reports',
    `<h1>PlayLab test reports</h1>
<p>The latest reports from the pipelines on <code>main</code>. Each row links the report and the run that made it. This site was built from commit <code>${esc(sha)}</code>${buildUrl ? ` (<a href="${esc(buildUrl)}">build</a>)` : ''} at ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.</p>
<table><thead><tr><th>Report</th><th>Open</th><th>From run</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted">PlayLab is a local practice shop: these reports come from tests against a stack that exists only while a pipeline runs.</p>`,
  ),
);
console.log(`Wrote ${path.join(site, 'index.html')} (${rendered.length} Markdown reports rendered)`);
