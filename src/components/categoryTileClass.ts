import type { M3CatColor } from "@/lib/categoryStyle";

/**
 * 以大項顏色上色的格子樣式（記一筆的分類格、刷卡待確認的分類按鈕共用）。
 * class 必須完整寫在 src/components 或 src/app 底下，Tailwind 才掃得到（src/lib 不在掃描範圍）。
 */
export const CATEGORY_TILE_CLASS: Record<M3CatColor, { idle: string; selected: string }> = {
  food: {
    idle: "border-cat-food bg-cat-food/10 hover:bg-cat-food/15 active:bg-cat-food/20",
    selected: "border-cat-food bg-cat-food/25",
  },
  transport: {
    idle: "border-cat-transport bg-cat-transport/10 hover:bg-cat-transport/15 active:bg-cat-transport/20",
    selected: "border-cat-transport bg-cat-transport/25",
  },
  shop: {
    idle: "border-cat-shop bg-cat-shop/10 hover:bg-cat-shop/15 active:bg-cat-shop/20",
    selected: "border-cat-shop bg-cat-shop/25",
  },
  home: {
    idle: "border-cat-home bg-cat-home/10 hover:bg-cat-home/15 active:bg-cat-home/20",
    selected: "border-cat-home bg-cat-home/25",
  },
  health: {
    idle: "border-cat-health bg-cat-health/10 hover:bg-cat-health/15 active:bg-cat-health/20",
    selected: "border-cat-health bg-cat-health/25",
  },
  fun: {
    idle: "border-cat-fun bg-cat-fun/10 hover:bg-cat-fun/15 active:bg-cat-fun/20",
    selected: "border-cat-fun bg-cat-fun/25",
  },
};
