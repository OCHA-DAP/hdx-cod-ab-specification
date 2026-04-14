import promptRaw from '/specs/prompt.md?raw';
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
  const preamble = stripFrontmatter(promptRaw).trimStart();
  const sources = parseSources(boundariesRaw);

  const specSection = [
    boundariesRaw,
    ...sources.map((src) => {
      const resolvedPath = src.includes('/') ? src : `specs/boundaries/${src}`;
      return specModules[`/${resolvedPath}`] ?? '';
    }),
  ]
    .filter(Boolean)
    .map((raw) => stripFrontmatter(raw).trimStart())
    .join('\n\n---\n\n');

  const body = preamble.trimEnd() + '\n\n---\n\n## Specification Reference\n\n' + specSection;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
