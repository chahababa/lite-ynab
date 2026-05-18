import {
  buildMonthlyReportPlainSummary,
  formatMonthlyExpenseReportForTelegram,
  type MonthlyExpenseReport,
} from "./monthlyExpenseReport";

const DEFAULT_MONTHLY_REPORT_DATABASE_ID = "3646f483-1a61-8191-8280-c2ab8ca8fa0c";
const NOTION_API_VERSION = "2022-06-28";
const RICH_TEXT_LIMIT = 1900;

type NotionPageResult = { id: string; url?: string };
type NotionSearchResult = { results?: NotionPageResult[] };

export async function saveMonthlyReportToNotion(report: MonthlyExpenseReport, options?: { telegramSent?: boolean }) {
  const token = process.env.NOTION_API_KEY ?? process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_MONTHLY_REPORT_DATABASE_ID ?? DEFAULT_MONTHLY_REPORT_DATABASE_ID;

  if (!token) {
    throw new Error("Missing NOTION_API_KEY or NOTION_TOKEN");
  }

  const headers = buildNotionHeaders(token);
  const properties = buildMonthlyReportProperties(report, options);
  const existingPage = await findExistingMonthlyReportPage(databaseId, report.monthId, headers);

  if (existingPage) {
    const response = await fetch(`https://api.notion.com/v1/pages/${existingPage.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Notion monthly report update failed: ${response.status} ${body}`);
    }

    return (await response.json()) as NotionPageResult;
  }

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
      children: buildMonthlyReportBlocks(report),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Notion monthly report save failed: ${response.status} ${body}`);
  }

  return (await response.json()) as NotionPageResult;
}

async function findExistingMonthlyReportPage(databaseId: string, monthId: string, headers: Record<string, string>) {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filter: {
        property: "月份",
        rich_text: {
          equals: monthId,
        },
      },
      page_size: 1,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Notion monthly report lookup failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as NotionSearchResult;
  return data.results?.[0] ?? null;
}

function buildNotionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_API_VERSION,
  };
}

function buildMonthlyReportProperties(report: MonthlyExpenseReport, options?: { telegramSent?: boolean }) {
  return {
    名稱: {
      title: [{ text: { content: `LiteYNAB ${report.monthId} 月報` } }],
    },
    月份: {
      rich_text: [{ text: { content: report.monthId } }],
    },
    總支出: {
      number: report.totalSpent,
    },
    總預算: {
      number: report.totalBudget,
    },
    剩餘: {
      number: report.remaining,
    },
    交易筆數: {
      number: report.transactionCount,
    },
    超支項目數: {
      number: report.overspentAlerts.length,
    },
    "Top 支出佔比": {
      rich_text: [{ text: { content: truncateRichText(buildTopShareText(report)) } }],
    },
    提醒: {
      rich_text: [{ text: { content: truncateRichText(buildMonthlyReportPlainSummary(report)) } }],
    },
    "Raw JSON": {
      rich_text: [{ text: { content: truncateRichText(JSON.stringify(report)) } }],
    },
    產生時間: {
      date: { start: report.generatedAt },
    },
    "Telegram 已傳送": {
      checkbox: options?.telegramSent ?? false,
    },
  };
}

function buildMonthlyReportBlocks(report: MonthlyExpenseReport) {
  return [
    paragraph(formatMonthlyExpenseReportForTelegram(report)),
    paragraph(`Raw JSON：${JSON.stringify(report)}`),
  ];
}

function paragraph(content: string) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: truncateRichText(content) } }],
    },
  };
}

function buildTopShareText(report: MonthlyExpenseReport) {
  return report.categoryBreakdown
    .slice(0, 5)
    .map((item) => `${item.name} ${Math.round(item.share * 100)}%`)
    .join("、");
}

function truncateRichText(value: string) {
  return value.length > RICH_TEXT_LIMIT ? `${value.slice(0, RICH_TEXT_LIMIT - 1)}…` : value;
}
