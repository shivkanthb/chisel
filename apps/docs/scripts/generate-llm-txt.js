import fs from 'fs';
import path from 'path';

const DOCS_DIR = new URL('../src/content/docs', import.meta.url).pathname;
const OUT_FILE = new URL('../public/llm.txt', import.meta.url).pathname;

const sections = [
  {
    name: 'Core',
    dir: 'core',
    files: ['overview', 'installation', 'quick-start', 'features', 'parallel-steps'],
  },
  {
    name: 'Studio',
    dir: 'studio',
    files: ['overview', 'installation', 'usage', 'features', 'options'],
  },
];

function stripMdx(content) {
  // Remove frontmatter
  content = content.replace(/^---[\s\S]*?---\n*/, '');

  // Remove import statements
  content = content.replace(/^import\s+.*;\s*\n*/gm, '');

  // Convert <CodeTabs> to plain code blocks
  content = content.replace(
    /<CodeTabs\s*\n?\s*npm="([^"]*)"\s*\n?\s*pnpm="([^"]*)"\s*\n?\s*bun="([^"]*)"\s*\n?\s*\/>/g,
    (_, npm, pnpm, bun) =>
      '```bash\n' + npm + '\n# or\n' + pnpm + '\n# or\n' + bun + '\n```',
  );

  return content.trim();
}

const header = `# Chisel Documentation

> Chisel is a lightweight workflow engine built on BullMQ and Redis. It provides an Inngest-shaped DX (defineWorkflow / ctx.step()) with zero magic — no build plugins, no code transforms, no directives. Framework-agnostic: works anywhere JS runs.
`;

const parts = [header];

for (const section of sections) {
  parts.push(`---\n\n## ${section.name}\n`);

  for (const slug of section.files) {
    const filePath = path.join(DOCS_DIR, section.dir, `${slug}.mdx`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    parts.push(stripMdx(raw));
  }
}

fs.writeFileSync(OUT_FILE, parts.join('\n\n') + '\n');
console.log(`Generated ${OUT_FILE}`);
