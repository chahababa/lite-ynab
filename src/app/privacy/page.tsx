import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "隱私權政策｜Lite YNAB",
};

const sections: { title: string; items: string[] }[] = [
  {
    title: "這個網站是什麼",
    items: [
      "Lite YNAB 是自用的記帳工具，用來規劃每月預算與記錄支出，不對外提供服務，也沒有廣告。",
    ],
  },
  {
    title: "會存哪些資料",
    items: [
      "登入用的電子郵件。",
      "你自己輸入的記帳資料：分類、預算、每一筆支出的日期、金額與備註。",
      "如果開啟「刷卡通知自動記帳」，會存下銀行刷卡通知信裡的刷卡時間、金額與商店名稱。",
    ],
  },
  {
    title: "Gmail 的使用方式",
    items: [
      "只在你本人授權後，以「唯讀」方式讀取銀行寄來的刷卡通知信。",
      "不會讀取其他信件的內容，也不會寄信、刪信或修改信箱裡的任何東西。",
      "讀到的資料只用來在這個記帳工具裡建立待確認的支出紀錄，不會用在其他用途。",
      "隨時可以到 Google 帳戶的「第三方應用程式與服務」移除授權，移除後就不再讀取。",
    ],
  },
  {
    title: "資料放在哪裡、給誰看",
    items: [
      "資料存放在這個網站使用的雲端資料庫，只有登入的本人看得到自己的資料。",
      "不會把資料賣給或提供給任何第三方，也不會用來訓練 AI 模型。",
    ],
  },
  {
    title: "刪除資料",
    items: ["想刪除帳號與所有記帳資料時，請聯絡網站管理者處理。"],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        <p className="text-label-sm uppercase tracking-[0.18em] text-on-surface-variant">Lite YNAB</p>
        <h1 className="mt-3 text-headline-md">隱私權政策</h1>
        <p className="mt-2 text-body-sm text-on-surface-variant">最後更新：2026 年 11 月 26 日</p>

        <div className="mt-6 space-y-4">
          {sections.map((section) => (
            <section key={section.title} className="rounded-md border border-outline bg-surface p-5 shadow-elev-1">
              <h2 className="text-title-md">{section.title}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-body-md text-on-surface-variant">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <Link
          href="/login"
          className="mt-6 inline-block text-body-md font-medium text-primary underline-offset-4 hover:underline active:opacity-70"
        >
          回到登入頁
        </Link>
      </div>
    </main>
  );
}
