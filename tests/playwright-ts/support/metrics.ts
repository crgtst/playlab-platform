/** The value of one sample in Prometheus text, matched on its name and (a subset of) its labels. */
export function sample(text: string, name: string, labels: Record<string, string> = {}): number | undefined {
  for (const line of text.split('\n')) {
    const match = line.match(/^([a-zA-Z_:][\w:]*)(?:\{(.*)\})? (\S+)$/);
    if (!match || match[1] !== name) continue;
    const found = Object.fromEntries([...(match[2] ?? '').matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    if (Object.entries(labels).every(([key, value]) => found[key] === value)) return Number(match[3]);
  }
  return undefined;
}
