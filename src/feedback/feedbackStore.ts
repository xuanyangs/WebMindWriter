import fs from "node:fs/promises";
import path from "node:path";
import type { FeedbackRecord, FeedbackType, NewFeedback } from "./feedbackTypes.js";
import { feedbackTypes } from "./feedbackTypes.js";

export class FeedbackStore {
  constructor(private readonly feedbackDir: string) {}

  async add(feedback: NewFeedback): Promise<FeedbackRecord> {
    validateFeedback(feedback);
    await fs.mkdir(this.feedbackDir, { recursive: true });

    const record: FeedbackRecord = {
      id: makeFeedbackId(feedback),
      target: feedback.target,
      type: feedback.type,
      rating: feedback.rating,
      note: feedback.note,
      reportPath: feedback.reportPath,
      createdAt: new Date().toISOString()
    };

    await fs.appendFile(this.feedbackPath(), `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  async list(options: {
    target?: string;
    type?: FeedbackType;
    limit: number;
  }): Promise<FeedbackRecord[]> {
    const records = await this.readAll();
    return records
      .filter((record) => !options.target || record.target === options.target)
      .filter((record) => !options.type || record.type === options.type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, options.limit);
  }

  async summary(): Promise<Array<{ type: FeedbackType; count: number; average: number }>> {
    const records = await this.readAll();
    const grouped = new Map<FeedbackType, FeedbackRecord[]>();

    for (const record of records) {
      grouped.set(record.type, [...(grouped.get(record.type) ?? []), record]);
    }

    return [...grouped.entries()]
      .map(([type, items]) => ({
        type,
        count: items.length,
        average: round(items.reduce((sum, item) => sum + item.rating, 0) / items.length)
      }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }

  async readAll(): Promise<FeedbackRecord[]> {
    try {
      const content = await fs.readFile(this.feedbackPath(), "utf8");
      return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as FeedbackRecord);
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  feedbackPath(): string {
    return path.join(this.feedbackDir, "feedback.jsonl");
  }
}

function validateFeedback(feedback: NewFeedback): void {
  if (!feedback.target.trim()) {
    throw new Error("--target is required.");
  }

  if (!feedbackTypes.includes(feedback.type)) {
    throw new Error(`--type must be one of: ${feedbackTypes.join(", ")}`);
  }

  if (!Number.isInteger(feedback.rating) || feedback.rating < 1 || feedback.rating > 5) {
    throw new Error("--rating must be an integer from 1 to 5.");
  }
}

function makeFeedbackId(feedback: NewFeedback): string {
  const compactTime = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const safeTarget = feedback.target.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  return `${compactTime}-${feedback.type}-${safeTarget}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
