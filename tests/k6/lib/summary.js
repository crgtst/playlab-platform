// handleSummary: the run's thresholds as JUnit XML (the input to the traceability report), JSON and a small HTML page.
//
// Every threshold becomes a test case named "<AC> <what> <expression>", failed if the threshold failed. A script can add cases
// of its own (the soak's drift between its first and last minutes is not a k6 threshold).

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Every threshold in the summary: { metric, expression, ok }. */
export function thresholdResults(data) {
  const out = [];
  for (const [metric, m] of Object.entries(data.metrics)) {
    // `max>=0` is how a script makes k6 report a tagged sub-metric. It always passes and says nothing, so it is not a test case.
    for (const [expression, t] of Object.entries(m.thresholds || {})) if (expression !== 'max>=0') out.push({ metric, expression, ok: t.ok });
  }
  return out;
}

const value = (data, metric, key) => data.metrics[metric] && data.metrics[metric].values[key];
const ms = (n) => (n === undefined ? '-' : `${n.toFixed(1)} ms`);

export function junit(suite, cases) {
  const failed = cases.filter((c) => !c.ok).length;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="${esc(suite)}" tests="${cases.length}" failures="${failed}">`,
    `<testsuite name="${esc(suite)}" tests="${cases.length}" failures="${failed}">`,
    ...cases.map((c) =>
      c.ok
        ? `<testcase classname="${esc(suite)}" name="${esc(c.name)}"/>`
        : `<testcase classname="${esc(suite)}" name="${esc(c.name)}"><failure message="${esc(c.message || 'threshold crossed')}"/></testcase>`,
    ),
    '</testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}

function text(suite, data, cases) {
  const lines = [`\n${suite}`, `  requests: ${value(data, 'http_reqs', 'count')} at ${(value(data, 'http_reqs', 'rate') || 0).toFixed(1)}/s`];
  lines.push(`  duration: avg ${ms(value(data, 'http_req_duration', 'avg'))}, p95 ${ms(value(data, 'http_req_duration', 'p(95)'))}, p99 ${ms(value(data, 'http_req_duration', 'p(99)'))}`);
  for (const c of cases) lines.push(`  ${c.ok ? 'pass' : 'FAIL'}  ${c.name}${c.ok ? '' : `: ${c.message || ''}`}`);
  return `${lines.join('\n')}\n`;
}

function html(suite, data, cases) {
  const rows = cases.map((c) => `<tr class="${c.ok ? 'ok' : 'bad'}"><td>${c.ok ? 'pass' : 'FAIL'}</td><td>${esc(c.name)}</td><td>${esc(c.message || '')}</td></tr>`).join('');
  const metrics = Object.entries(data.metrics)
    .filter(([name]) => /^(http_req_duration|http_req_failed|http_reqs|dropped_iterations)/.test(name))
    .map(([name, m]) => `<tr><td>${esc(name)}</td><td>${esc(JSON.stringify(m.values))}</td></tr>`)
    .join('');
  return `<!doctype html><meta charset="utf-8"><title>${esc(suite)}</title>
<style>body{font:15px system-ui;margin:2rem;max-width:70rem}td,th{padding:.3rem .8rem;border-bottom:1px solid #ddd;text-align:left}.ok td:first-child{color:#0a7d33}.bad td:first-child{color:#c62828;font-weight:700}code{font-size:12px}</style>
<h1>${esc(suite)}</h1><h2>Thresholds</h2><table><tr><th>Result</th><th>What</th><th></th></tr>${rows}</table>
<h2>Metrics</h2><table>${metrics}</table>`;
}

/**
 * Builds the handleSummary function for a script.
 *  - suite: file name stem and test suite name ("products")
 *  - ac: the AC ID every case name starts with
 *  - titles: { metric: 'what it measures' } for readable names
 *  - extra: (data) => [{ name, ok, message }] for checks k6 has no threshold for
 */
export function summaryFor({ suite, ac, titles = {}, extra = () => [] }) {
  return (data) => {
    const cases = [
      ...thresholdResults(data).map((t) => ({
        name: `${ac} ${titles[t.metric] || t.metric}: ${t.expression}`,
        ok: t.ok,
        message: `${t.metric} ${t.expression} was crossed`,
      })),
      ...extra(data).map((c) => ({ ...c, name: `${ac} ${c.name}` })),
    ];
    return {
      stdout: text(suite, data, cases),
      [`results/junit-${suite}.xml`]: junit(`k6 ${suite}`, cases),
      [`results/${suite}-summary.json`]: JSON.stringify(data, null, 2),
      [`results/${suite}.html`]: html(suite, data, cases),
    };
  };
}

export { value as metricValue };
