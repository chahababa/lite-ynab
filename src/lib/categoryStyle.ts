/**
 * 把使用者建立的分類名稱對應到 M3 cat palette 與 lucide icon。
 * 沒對到關鍵字的分類落到 fallback（cat.shop 紫 + Tag icon），確保畫面永遠有顏色。
 */

export type M3CatColor = "food" | "transport" | "shop" | "home" | "health" | "fun";
export type M3CatIcon =
  | "Utensils"
  | "Coffee"
  | "Car"
  | "ShoppingBag"
  | "Home"
  | "Heart"
  | "Music"
  | "Plane"
  | "CreditCard"
  | "Tag";

type Style = { color: M3CatColor; icon: M3CatIcon };

// 順序很重要：較具體的關鍵字（咖啡）擺在較廣的（食）前面
const RULES: Array<{ keywords: string[]; style: Style }> = [
  { keywords: ["咖啡", "coffee"], style: { color: "food", icon: "Coffee" } },
  { keywords: ["飲食", "食", "餐", "飯"], style: { color: "food", icon: "Utensils" } },
  { keywords: ["交通", "車", "油", "捷運"], style: { color: "transport", icon: "Car" } },
  { keywords: ["旅行", "旅遊"], style: { color: "fun", icon: "Plane" } },
  { keywords: ["訂閱", "會員"], style: { color: "transport", icon: "CreditCard" } },
  { keywords: ["娛樂", "遊戲"], style: { color: "fun", icon: "Music" } },
  { keywords: ["日常", "購物", "用品"], style: { color: "shop", icon: "ShoppingBag" } },
  { keywords: ["房租", "家", "居"], style: { color: "home", icon: "Home" } },
  { keywords: ["健康", "醫"], style: { color: "health", icon: "Heart" } },
];

const FALLBACK: Style = { color: "shop", icon: "Tag" };

export function getCategoryStyle(name: string): Style {
  const lower = name.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return rule.style;
    }
  }
  return FALLBACK;
}

/** Tailwind class for solid bg by cat color. */
export const CAT_BG_CLASS: Record<M3CatColor, string> = {
  food: "bg-cat-food",
  transport: "bg-cat-transport",
  shop: "bg-cat-shop",
  home: "bg-cat-home",
  health: "bg-cat-health",
  fun: "bg-cat-fun",
};

/** Tailwind class for text color by cat color. */
export const CAT_TEXT_CLASS: Record<M3CatColor, string> = {
  food: "text-cat-food",
  transport: "text-cat-transport",
  shop: "text-cat-shop",
  home: "text-cat-home",
  health: "text-cat-health",
  fun: "text-cat-fun",
};

/** Tailwind class for border color by cat color. */
export const CAT_BORDER_CLASS: Record<M3CatColor, string> = {
  food: "border-cat-food",
  transport: "border-cat-transport",
  shop: "border-cat-shop",
  home: "border-cat-home",
  health: "border-cat-health",
  fun: "border-cat-fun",
};
