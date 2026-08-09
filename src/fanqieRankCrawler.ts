import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { decodeFanqieText } from "./fanqieFontDecoder.js";
import { fetchHtml } from "./http.js";
import type { CrawlOptions, RankSnapshot, RankingItem } from "./types.js";

const fanqieOrigin = "https://fanqienovel.com";

export async function crawlFanqieRank(
  options: CrawlOptions
): Promise<RankSnapshot> {
  const rankParams = inferRankParams(options);
  const apiItems = await fetchRankApiItems(options);
  const items =
    apiItems.length > 0
      ? apiItems.slice(0, options.limit)
      : parseRankingItems(await fetchHtml(options.url, options.timeoutMs), options.url)
          .slice(0, options.limit);
  const capturedAt = new Date().toISOString();

  return {
    id: makeSnapshotId(capturedAt, options.url),
    source: "fanqie",
    rankUrl: options.url,
    rankName: options.rankName ?? inferRankName(options.url),
    gender: rankParams.gender,
    rankMold: rankParams.rankMold,
    categoryId: rankParams.categoryId,
    categoryName: options.categoryName ?? rankParams.categoryName,
    capturedAt,
    itemCount: items.length,
    items
  };
}

type FanqieBook = {
  abstract?: string;
  author?: string;
  bookId?: string;
  bookName?: string;
  category?: string;
  categoryV2?: string;
  creationStatus?: string;
  currentPos?: number;
  rankPos?: number;
  read_count?: string;
  readCount?: string;
  wordNumber?: string | number;
};

async function fetchRankApiItems(options: CrawlOptions): Promise<RankingItem[]> {
  const rankParams = inferRankParams(options);
  const apiUrl = new URL("/api/rank/category/list", fanqieOrigin);

  apiUrl.searchParams.set("app_id", "1967");
  apiUrl.searchParams.set("rank_list_type", "3");
  apiUrl.searchParams.set("offset", "0");
  apiUrl.searchParams.set("limit", String(options.limit));
  apiUrl.searchParams.set("category_id", rankParams.categoryId);
  apiUrl.searchParams.set("rank_version", "");
  apiUrl.searchParams.set("gender", rankParams.gender);
  apiUrl.searchParams.set("rankMold", rankParams.rankMold);

  const response = await fetch(apiUrl, {
    signal: AbortSignal.timeout(options.timeoutMs),
    headers: {
      "accept": "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "referer": options.url,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`Rank API HTTP ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    data?: { book_list?: FanqieBook[] };
  };

  if (payload.code !== 0) {
    throw new Error(payload.message ?? `Rank API code ${payload.code}`);
  }

  return (payload.data?.book_list ?? []).map((book, index) =>
    mapApiBook(book, index, rankParams.categoryName)
  );
}

function mapApiBook(
  book: FanqieBook,
  index: number,
  categoryName?: string
): RankingItem {
  const title = decodeFanqieText(book.bookName)?.trim() ?? "";
  const author = decodeFanqieText(book.author);
  const description = decodeFanqieText(book.abstract)?.trim();
  const rank = Number(book.currentPos ?? book.rankPos ?? index + 1);
  const wordCount = formatWordCount(book.wordNumber);
  const heat = book.read_count || book.readCount;
  const category =
    decodeFanqieText(book.category) ||
    decodeFanqieText(book.categoryV2) ||
    categoryName;

  return {
    rank,
    title,
    author,
    category,
    tags: pickTags(`${title} ${description ?? ""} ${category ?? ""}`),
    description,
    wordCount,
    status: mapCreationStatus(book.creationStatus),
    heat: heat ? `${heat} 在读` : undefined,
    bookId: book.bookId,
    sourceUrl: book.bookId
      ? new URL(`/page/${book.bookId}`, fanqieOrigin).toString()
      : undefined
  };
}

function inferRankParams(options: CrawlOptions): {
  categoryId: string;
  gender: string;
  rankMold: string;
  categoryName?: string;
} {
  const pathname = new URL(options.url).pathname;
  const encoded = pathname.split("/").filter(Boolean).at(-1);
  const match = encoded?.match(/^(\d+)_(\d+)_(\d+)$/);

  return {
    gender: options.gender ?? match?.[1] ?? "1",
    rankMold: options.rankMold ?? match?.[2] ?? "1",
    categoryId: options.categoryId ?? match?.[3] ?? "1140",
    categoryName:
      options.categoryName ??
      categoryNameById(options.categoryId ?? match?.[3] ?? "1140")
  };
}

function categoryNameById(categoryId: string): string | undefined {
  const categoryMap: Record<string, string> = {
    "1141": "西方奇幻",
    "1140": "东方仙侠",
    "8": "科幻末世",
    "261": "都市日常",
    "124": "都市修真",
    "1014": "都市高武",
    "273": "历史古代",
    "27": "战神赘婿",
    "263": "都市种田",
    "258": "传统玄幻",
    "272": "历史脑洞",
    "539": "悬疑脑洞",
    "262": "都市脑洞",
    "257": "玄幻脑洞",
    "751": "悬疑灵异",
    "504": "抗战谍战",
    "746": "游戏体育",
    "718": "动漫衍生",
    "1016": "男频衍生",
    "1139": "古风世情",
    "1015": "女频衍生",
    "248": "玄幻言情",
    "23": "种田",
    "79": "年代",
    "267": "现言脑洞",
    "246": "宫斗宅斗",
    "253": "古言脑洞",
    "24": "快穿",
    "749": "青春甜宠",
    "745": "星光璀璨",
    "747": "女频悬疑",
    "750": "职场婚恋",
    "748": "豪门总裁",
    "1017": "民国言情"
  };

  return categoryMap[categoryId];
}

function formatWordCount(value: string | number | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  const count = Number(value);

  if (!Number.isFinite(count)) return String(value);
  if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万字`;
  return `${count}字`;
}

function mapCreationStatus(value: string | undefined): string | undefined {
  if (value === "0") return "连载中";
  if (value === "1") return "已完结";
  return undefined;
}

export function parseRankingItems(html: string, rankUrl: string): RankingItem[] {
  const $ = cheerio.load(html);
  const candidates = findBookContainers($);
  const seen = new Set<string>();
  const items: RankingItem[] = [];

  candidates.each((index, element) => {
    const container = $(element);
    const titleLink = findTitleLink($, container);
    const title = decodeFanqieText(normalizeText(titleLink.text())) ?? "";
    const sourceUrl = normalizeUrl(titleLink.attr("href"), rankUrl);

    if (!title || seen.has(title)) return;

    seen.add(title);
    const text = decodeFanqieText(normalizeText(container.text())) ?? "";

    items.push({
      rank: items.length + 1,
      title,
      author: pickByLabel(text, ["作者", "作家"]) ?? pickAuthor($, container),
      category: pickCategory(text),
      tags: pickTags(text),
      description: decodeFanqieText(pickDescription($, container, title)),
      wordCount: pickByPattern(text, /(\d+(?:\.\d+)?\s*[万千]字)/),
      status: pickByPattern(text, /(连载中|已完结|完结|暂停)/),
      heat: pickByPattern(text, /(\d+(?:\.\d+)?\s*[万千亿]?\s*(?:热度|在读|人气|推荐))/),
      sourceUrl
    });
  });

  return items;
}

function findBookContainers($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> {
  const directSelectors = [
    "[class*=rank] [class*=book]",
    "[class*=book] [class*=item]",
    "li:has(a[href*='/page/'])",
    "div:has(a[href*='/page/'])"
  ];

  for (const selector of directSelectors) {
    const found = $(selector).filter((_, element) => {
      const text = normalizeText($(element).text());
      return text.length > 8 && text.length < 1200;
    });

    if (found.length >= 10) return found;
  }

  return $("a[href*='/page/']")
    .map((_, link) => $(link).closest("li, div, section, article").get(0))
    .filter((_, element) => Boolean(element));
}

function findTitleLink(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>
): cheerio.Cheerio<AnyNode> {
  const links = container.find("a[href*='/page/']");
  const strongCandidate = links.filter((_, link) => {
    const text = normalizeText($(link).text());
    return text.length >= 2 && text.length <= 40;
  });

  return strongCandidate.first().length > 0 ? strongCandidate.first() : links.first();
}

function pickDescription(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>,
  title: string
): string | undefined {
  const paragraph = container
    .find("p")
    .map((_, element) => normalizeText($(element).text()))
    .get()
    .find((text) => text && text !== title && text.length >= 12);

  if (paragraph) return paragraph;

  const text = normalizeText(container.text()).replace(title, "").trim();
  return text.length >= 20 ? text.slice(0, 180) : undefined;
}

function pickAuthor(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>
): string | undefined {
  const authorNode = container
    .find("[class*=author], a[href*='author']")
    .first();
  const author = normalizeText(authorNode.text());
  return author || undefined;
}

function pickByLabel(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}[：:]?\\s*([^\\s｜|/]{2,24})`));
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function pickByPattern(text: string, pattern: RegExp): string | undefined {
  return text.match(pattern)?.[1]?.trim();
}

function pickCategory(text: string): string | undefined {
  const categories = [
    "都市",
    "玄幻",
    "脑洞",
    "历史",
    "悬疑",
    "科幻",
    "游戏",
    "仙侠",
    "奇幻",
    "武侠",
    "现实",
    "言情",
    "古言",
    "现言",
    "青春",
    "轻小说",
    "衍生"
  ];

  return categories.find((category) => text.includes(category));
}

function pickTags(text: string): string[] {
  const tags = [
    "系统",
    "穿越",
    "重生",
    "爽文",
    "无敌",
    "赘婿",
    "灵气复苏",
    "末世",
    "直播",
    "种田",
    "宫斗",
    "甜宠",
    "反派",
    "女强",
    "单女主",
    "多女主",
    "经营",
    "升级",
    "热血",
    "群像"
  ];

  return tags.filter((tag) => text.includes(tag));
}

function normalizeText(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value: string | undefined, rankUrl: string): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value, fanqieOrigin).toString();
  } catch {
    return new URL(value, rankUrl).toString();
  }
}

function inferRankName(url: string): string {
  const pathname = new URL(url).pathname;
  const last = pathname.split("/").filter(Boolean).pop();
  return last ? `fanqie-${last}` : "fanqie-rank";
}

function makeSnapshotId(capturedAt: string, url: string): string {
  const compactTime = capturedAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  const rankName = inferRankName(url).replace(/[^a-zA-Z0-9-]/g, "");
  return `${rankName}-${compactTime}`;
}
