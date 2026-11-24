import { redirect } from "next/navigation";

// 手機使用情境幾乎都是為了記帳：打開 App 直接進快速記帳，
// 預算狀況在「本月」頁（/month），由底部導覽列進入。
export default function RootPage() {
  redirect("/quick-entry");
}
