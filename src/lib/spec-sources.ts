import { readFileSync } from "fs";
import { load } from "js-yaml";
import { join } from "path";

function readSources(readmePath: string): string[] {
  const text = readFileSync(join(process.cwd(), readmePath), "utf-8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const { sources } = load(fm) as { sources: string[] };
  return sources;
}

function readContent(dir: string, sources: string[]): string {
  return sources
    .map((f) => readFileSync(join(process.cwd(), dir, f), "utf-8"))
    .join("\n\n");
}

export function specContent(): string {
  const readmePath = "specs/boundaries/README.md";
  const sources = readSources(readmePath);
  const readme = readFileSync(join(process.cwd(), readmePath), "utf-8").replace(
    /^---[\s\S]*?---\n/,
    ""
  );
  return `${readme}\n\n${readContent("specs/boundaries", sources)}`;
}

export function promptContent(): string {
  const preamble = readFileSync(
    join(process.cwd(), "specs/prompt.md"),
    "utf-8"
  );
  return `${preamble}\n\n${specContent()}`;
}
