import fs from "node:fs/promises";
import path from "node:path";

export type BookOpeningSample = {
  bookId: string;
  title?: string;
  sourceUrl?: string;
  createdAt?: string;
  content: string;
  filePath: string;
};

export class SampleStore {
  constructor(private readonly sampleDir: string) {}

  async createTemplate(options: {
    bookId: string;
    title?: string;
    sourceUrl?: string;
  }): Promise<string> {
    await fs.mkdir(this.openingDir(), { recursive: true });
    const filePath = this.samplePath(options.bookId);

    await fs.writeFile(
      filePath,
      [
        `---`,
        `bookId: ${options.bookId}`,
        `title: ${options.title ?? ""}`,
        `sourceUrl: ${options.sourceUrl ?? ""}`,
        `createdAt: ${new Date().toISOString()}`,
        `---`,
        ``,
        `在这里粘贴你手动整理的公开试读/开局样本文本。`,
        `不要把非授权全文或大段付费正文放进来。`,
        ``
      ].join("\n"),
      "utf8"
    );

    return filePath;
  }

  async importFromFile(options: {
    bookId: string;
    title?: string;
    sourceUrl?: string;
    inputPath: string;
  }): Promise<string> {
    await fs.mkdir(this.openingDir(), { recursive: true });
    const content = await fs.readFile(options.inputPath, "utf8");
    const filePath = this.samplePath(options.bookId);

    await fs.writeFile(
      filePath,
      [
        `---`,
        `bookId: ${options.bookId}`,
        `title: ${options.title ?? ""}`,
        `sourceUrl: ${options.sourceUrl ?? ""}`,
        `createdAt: ${new Date().toISOString()}`,
        `---`,
        ``,
        content.trim(),
        ``
      ].join("\n"),
      "utf8"
    );

    return filePath;
  }

  async read(bookId: string): Promise<BookOpeningSample | undefined> {
    const filePath = this.samplePath(bookId);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = parseSample(raw);
      return {
        bookId: parsed.frontmatter.bookId ?? bookId,
        title: parsed.frontmatter.title,
        sourceUrl: parsed.frontmatter.sourceUrl,
        createdAt: parsed.frontmatter.createdAt,
        content: parsed.content,
        filePath
      };
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  async list(): Promise<BookOpeningSample[]> {
    await fs.mkdir(this.openingDir(), { recursive: true });
    const entries = await fs.readdir(this.openingDir(), { withFileTypes: true });
    const result: BookOpeningSample[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const bookId = path.basename(entry.name, ".md");
      const sample = await this.read(bookId);
      if (sample) result.push(sample);
    }

    return result.sort((a, b) => a.bookId.localeCompare(b.bookId));
  }

  samplePath(bookId: string): string {
    return path.join(this.openingDir(), `${safeFileName(bookId)}.md`);
  }

  private openingDir(): string {
    return path.join(this.sampleDir, "book-openings");
  }
}

function parseSample(raw: string): {
  frontmatter: Record<string, string>;
  content: string;
} {
  if (!raw.startsWith("---")) {
    return { frontmatter: {}, content: raw.trim() };
  }

  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, content: raw.trim() };
  }

  const frontmatterText = raw.slice(3, end).trim();
  const content = raw.slice(end + 4).trim();
  const frontmatter: Record<string, string> = {};

  for (const line of frontmatterText.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key) frontmatter[key] = value;
  }

  return { frontmatter, content };
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
