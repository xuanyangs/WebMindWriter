import type { RankTarget } from "./types.js";

const maleCategories = [
  ["1141", "西方奇幻"],
  ["1140", "东方仙侠"],
  ["8", "科幻末世"],
  ["261", "都市日常"],
  ["124", "都市修真"],
  ["1014", "都市高武"],
  ["273", "历史古代"],
  ["27", "战神赘婿"],
  ["263", "都市种田"],
  ["258", "传统玄幻"],
  ["272", "历史脑洞"],
  ["539", "悬疑脑洞"],
  ["262", "都市脑洞"],
  ["257", "玄幻脑洞"],
  ["751", "悬疑灵异"],
  ["504", "抗战谍战"],
  ["746", "游戏体育"],
  ["718", "动漫衍生"],
  ["1016", "男频衍生"]
] as const;

const femaleCategories = [
  ["1139", "古风世情"],
  ["8", "科幻末世"],
  ["746", "游戏体育"],
  ["1015", "女频衍生"],
  ["248", "玄幻言情"],
  ["23", "种田"],
  ["79", "年代"],
  ["267", "现言脑洞"],
  ["246", "宫斗宅斗"],
  ["539", "悬疑脑洞"],
  ["253", "古言脑洞"],
  ["24", "快穿"],
  ["749", "青春甜宠"],
  ["745", "星光璀璨"],
  ["747", "女频悬疑"],
  ["750", "职场婚恋"],
  ["748", "豪门总裁"],
  ["1017", "民国言情"]
] as const;

const rankMolds = [
  ["1", "阅读榜"],
  ["2", "新书榜"]
] as const;

export function getAllRankTargets(): RankTarget[] {
  return [
    ...buildTargets("1", "男频", maleCategories),
    ...buildTargets("2", "女频", femaleCategories)
  ];
}

function buildTargets(
  gender: string,
  genderName: string,
  categories: readonly (readonly [string, string])[]
): RankTarget[] {
  return rankMolds.flatMap(([rankMold, rankMoldName]) =>
    categories.map(([categoryId, categoryName]) => ({
      gender,
      genderName,
      rankMold,
      rankMoldName,
      categoryId,
      categoryName,
      url: `https://fanqienovel.com/rank/${gender}_${rankMold}_${categoryId}`,
      rankName: `${genderName}${rankMoldName}-${categoryName}`
    }))
  );
}
