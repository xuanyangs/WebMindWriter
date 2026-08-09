export type FeedbackType =
  | "scan"
  | "teardown"
  | "text-teardown"
  | "idea"
  | "recipe";

export type FeedbackRecord = {
  id: string;
  target: string;
  type: FeedbackType;
  rating: number;
  note?: string;
  reportPath?: string;
  createdAt: string;
};

export type NewFeedback = {
  target: string;
  type: FeedbackType;
  rating: number;
  note?: string;
  reportPath?: string;
};

export const feedbackTypes: FeedbackType[] = [
  "scan",
  "teardown",
  "text-teardown",
  "idea",
  "recipe"
];
