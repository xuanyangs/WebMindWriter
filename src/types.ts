export type RankingItem = {
  rank: number;
  title: string;
  author?: string;
  category?: string;
  tags: string[];
  description?: string;
  wordCount?: string;
  status?: string;
  heat?: string;
  bookId?: string;
  sourceUrl?: string;
};

export type RankSnapshot = {
  id: string;
  source: "fanqie";
  rankUrl: string;
  rankName: string;
  gender?: string;
  rankMold?: string;
  categoryId?: string;
  categoryName?: string;
  capturedAt: string;
  itemCount: number;
  items: RankingItem[];
};

export type RankTarget = {
  gender: string;
  genderName: string;
  rankMold: string;
  rankMoldName: string;
  categoryId: string;
  categoryName: string;
  url: string;
  rankName: string;
};

export type RankBatch = {
  id: string;
  source: "fanqie";
  capturedAt: string;
  targetCount: number;
  totalItemCount: number;
  snapshots: RankSnapshot[];
  failures: Array<{
    rankName: string;
    url: string;
    error: string;
  }>;
};

export type CrawlOptions = {
  url: string;
  limit: number;
  timeoutMs: number;
  categoryId?: string;
  gender?: string;
  rankMold?: string;
  rankName?: string;
  categoryName?: string;
};
