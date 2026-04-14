import boundariesRaw from '/specs/boundaries/README.md?raw';

const specModules = import.meta.glob('/specs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md;
  const end = md.indexOf('\n---', 3);
  return end === -1 ? md : md.slice(end + 4);
}

function parseSources(md: string): string[] {
  const fm = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return [...fm.matchAll(/^\s+-\s+(.+)$/gm)].map((m) => m[1].trim());
}

export function GET() {
  const sources = parseSources(boundariesRaw);

  const sections = [
    boundariesRaw,
    ...sources.map((src) => {
      const resolvedSrc = src.includes('/') ? src : `specs/boundaries/${src}`;
      return specModules[`/${resolvedSrc}`] ?? '';
    }),
  ]
    .filter(Boolean)
    .map((raw) => stripFrontmatter(raw).trimStart())
    .join('\n\n---\n\n');

  return new Response(sections, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
