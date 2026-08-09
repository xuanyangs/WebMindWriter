import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), "..");

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  defaultRankUrl:
    process.env.FANQIE_RANK_URL ?? "https://fanqienovel.com/rank/1_1_1140",
  defaultCategoryId: process.env.FANQIE_CATEGORY_ID ?? "1140",
  defaultGender: process.env.FANQIE_GENDER ?? "1",
  defaultRankMold: process.env.FANQIE_RANK_MOLD ?? "1",
  intervalMinutes: readNumber("CRAWL_INTERVAL_MINUTES", 360),
  topLimit: readNumber("CRAWL_TOP_LIMIT", 100),
  timeoutMs: readNumber("REQUEST_TIMEOUT_MS", 15_000),
  dataDir: path.resolve(projectRoot, process.env.DATA_DIR ?? "data"),
  reportDir: path.resolve(projectRoot, process.env.REPORT_DIR ?? "reports"),
  sampleDir: path.resolve(projectRoot, process.env.SAMPLE_DIR ?? "samples"),
  feedbackDir: path.resolve(projectRoot, process.env.FEEDBACK_DIR ?? "feedback"),
  projectDir: path.resolve(projectRoot, process.env.PROJECT_DIR ?? "projects"),
  uiDir: path.resolve(projectRoot, process.env.UI_DIR ?? "ui"),
  cloudDir: path.resolve(projectRoot, process.env.CLOUD_DIR ?? "cloud"),
  databasePath: path.resolve(
    projectRoot,
    process.env.DATABASE_PATH ?? "data/fanqie-loop.sqlite"
  )
};
