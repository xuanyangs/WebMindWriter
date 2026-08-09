import fs from "node:fs/promises";
import path from "node:path";

export type SourceReport = {
  name: string;
  path: string;
  exists: boolean;
  content: string;
};

const ideaSourceReports = [
  ["扫榜报告", "latest-agent-scan.md"],
  ["榜单拆书报告", "latest-book-teardown.md"],
  ["本地文本拆书报告", "latest-text-teardown.md"]
] as const;

export async function readLatestIdeaSourceReports(
  reportDir: string
): Promise<SourceReport[]> {
  const reports: SourceReport[] = [];

  for (const [name, fileName] of ideaSourceReports) {
    const reportPath = path.join(reportDir, fileName);
    reports.push({
      name,
      path: reportPath,
      ...(await readReport(reportPath))
    });
  }

  return reports;
}

async function readReport(reportPath: string): Promise<{
  exists: boolean;
  content: string;
}> {
  try {
    return {
      exists: true,
      content: await fs.readFile(reportPath, "utf8")
    };
  } catch (error) {
    if (isMissingFile(error)) {
      return {
        exists: false,
        content: ""
      };
    }

    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
