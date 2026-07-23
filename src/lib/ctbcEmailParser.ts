import { createHash } from "node:crypto";

export const CTBC_ALERT_SENDER = "bank.csc@inib.ctbcbank.com";
export const CTBC_ALERT_SUBJECT = "信用卡消費成交回報";

const EXPECTED_HEADERS = [
  "卡別",
  "末四碼",
  "消費日",
  "消費金額",
  "商店名稱",
  "商店類型│交易類型",
] as const;

const TRANSACTION_CHANNELS = [
  "非實體卡交易",
  "實體卡交易",
  "行動支付",
  "語音轉帳",
  "感應交易",
  "一般交易",
] as const;

type StructuralTag = "root" | "table" | "tr" | "td" | "th";

type HtmlNode = {
  tag: StructuralTag;
  children: HtmlNode[];
  text: string[];
};

export type CtbcEmailInput = {
  messageId: string;
  from: string;
  subject: string;
  authenticationResults: string;
  receivedAt?: string;
  html?: string | null;
  text?: string | null;
};

export type CtbcCardRole = "primary" | "supplementary" | "unknown";

export type CtbcEmailCandidate = {
  source: "ctbc_email_alert";
  gmailMessageId: string;
  sourceId: string;
  occurredAt: string;
  amountTwd: number;
  currency: "TWD";
  cardProductName: string;
  cardRole: CtbcCardRole;
  cardLast4: string;
  merchantRaw: string;
  merchantNormalized: string | null;
  bankCategoryRaw: string | null;
  transactionChannelRaw: string | null;
  suggestedCategoryId: null;
  suggestedPaymentMethodId: null;
  confidence: number;
  warnings: string[];
  status: "authorized_unreconciled";
};

export type CtbcEmailParseResult = {
  accepted: boolean;
  status: "rejected" | "parsed" | "parse_failed";
  messageId: string;
  candidates: CtbcEmailCandidate[];
  errors: string[];
};

export type CtbcDryRunReport = {
  dryRun: true;
  accepted: boolean;
  status: CtbcEmailParseResult["status"];
  messageIdHash: string;
  candidateCount: number;
  errorCount: number;
  errors: string[];
  candidates: Array<{
    index: number;
    occurredDate: string;
    amount: "[REDACTED]";
    card: "[REDACTED]";
    merchant: "[REDACTED]";
    cardRole: CtbcCardRole;
    bankCategoryRaw: string | null;
    transactionChannelRaw: string | null;
    warningCount: number;
    sourceIdHash: string;
  }>;
};

type ParsedRow = {
  cardLabel: string;
  cardLast4: string;
  occurredAt: string;
  amountTwd: number;
  merchantRaw: string;
  typeRaw: string;
};

function normalizeSpaces(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    try {
      if (code.startsWith("#x") || code.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
    } catch {
      return entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function extractEmailAddress(value: string) {
  const angleMatch = value.match(/<([^<>]+)>/);
  const candidate = angleMatch?.[1] ?? value;
  return candidate.trim().toLowerCase();
}

function isAcceptedSource(input: CtbcEmailInput) {
  const authenticationResults = normalizeSpaces(input.authenticationResults ?? "").toLowerCase();
  const exactDomainBoundary = "(?=[;\\s]|$)";
  const exactPassBoundary = "(?=[;\\s]|$)";
  const methodBoundary = "(?:^|;\\s*)";
  const authenticated =
    /^mx\.google\.com\s*;/.test(authenticationResults) &&
    !new RegExp(`${methodBoundary}(?:dkim|spf|dmarc)=(?!pass${exactPassBoundary})[^;\\s]+`).test(authenticationResults) &&
    new RegExp(`${methodBoundary}dkim=pass${exactPassBoundary}[^;]*header\\.i=@inib\\.ctbcbank\\.com${exactDomainBoundary}`).test(authenticationResults) &&
    new RegExp(`${methodBoundary}spf=pass${exactPassBoundary}[^;]*smtp\\.mailfrom=[^;\\s]*@inib\\.ctbcbank\\.com${exactDomainBoundary}`).test(authenticationResults) &&
    new RegExp(`${methodBoundary}dmarc=pass${exactPassBoundary}[^;]*header\\.from=inib\\.ctbcbank\\.com${exactDomainBoundary}`).test(authenticationResults);

  return (
    extractEmailAddress(input.from) === CTBC_ALERT_SENDER &&
    input.subject.trim() === CTBC_ALERT_SUBJECT &&
    authenticated
  );
}

function parseStructuralHtml(html: string) {
  const root: HtmlNode = { tag: "root", children: [], text: [] };
  const stack: HtmlNode[] = [root];
  // Tokenize every tag so inline markup (for example <font> or <span>) is
  // ignored rather than accidentally becoming part of the cell text.
  const tokenPattern = /<[^>]*>|[^<]+/g;

  for (const match of html.matchAll(tokenPattern)) {
    const token = match[0] ?? "";
    if (!token.startsWith("<")) {
      const nearestCell = [...stack].reverse().find((node) => node.tag === "td" || node.tag === "th");
      if (nearestCell) nearestCell.text.push(decodeHtmlEntities(token));
      continue;
    }

    const tagMatch = token.match(/^<\/?(table|tr|td|th)\b/i);
    if (!tagMatch) continue;
    const tag = tagMatch[1]?.toLowerCase() as Exclude<StructuralTag, "root">;
    const isClosing = /^<\//.test(token);

    if (!isClosing) {
      const node: HtmlNode = { tag, children: [], text: [] };
      stack[stack.length - 1]?.children.push(node);
      stack.push(node);
      continue;
    }

    const matchingIndex = stack.map((node) => node.tag).lastIndexOf(tag);
    if (matchingIndex > 0) stack.length = matchingIndex;
  }

  return root;
}

function cellText(node: HtmlNode) {
  return normalizeSpaces(node.text.join(" "));
}

function findTables(node: HtmlNode, result: HtmlNode[] = []) {
  if (node.tag === "table") result.push(node);
  for (const child of node.children) findTables(child, result);
  return result;
}

function directRows(table: HtmlNode) {
  return table.children
    .filter((child) => child.tag === "tr")
    .map((row) =>
      row.children
        .filter((child) => child.tag === "td" || child.tag === "th")
        .map(cellText),
    )
    .filter((cells) => cells.length > 0);
}

function headersMatch(cells: string[]) {
  return (
    cells.length === EXPECTED_HEADERS.length &&
    EXPECTED_HEADERS.every((header, index) => normalizeSpaces(cells[index] ?? "") === header)
  );
}

function candidateHtmlRows(html: string) {
  const tables = findTables(parseStructuralHtml(html));
  const candidates = tables
    .map(directRows)
    .map((rows) => {
      const headerIndex = rows.findIndex(headersMatch);
      return headerIndex < 0
        ? null
        : rows.slice(headerIndex + 1).filter((row) => row.length > 0);
    })
    .filter((rows): rows is string[][] => rows !== null && rows.length > 0)
    .sort((left, right) => right.length - left.length);

  return candidates[0] ?? [];
}

function candidateTextRows(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const splitCells = (line: string) => {
    const separator = line.includes("\t") ? /\t/ : /\s{2,}/;
    return line.split(separator).map(normalizeSpaces);
  };

  const headerIndex = lines.findIndex((line) => headersMatch(splitCells(line)));
  if (headerIndex < 0) return [];

  const rows: string[][] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (/^(?:註[:：]|貼心提醒[:：]|中國信託商業銀行)/.test(line)) break;
    const cells = splitCells(line);
    rows.push(cells);
  }
  return rows;
}

function parseOccurredAt(value: string) {
  const match = normalizeSpaces(value).match(/^(\d{3,4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) throw new Error("消費日格式不符");

  const [, rawYear, month, day, hour, minute] = match;
  const year = String(rawYear.length === 3 ? Number(rawYear) + 1911 : Number(rawYear));
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00+08:00`;
  const [yyyy, mm, dd, hh, min] = [year, month, day, hour, minute].map(Number);
  const calendarCheck = new Date(Date.UTC(yyyy, mm - 1, dd, hh, min));
  const valid =
    calendarCheck.getUTCFullYear() === yyyy &&
    calendarCheck.getUTCMonth() === mm - 1 &&
    calendarCheck.getUTCDate() === dd &&
    calendarCheck.getUTCHours() === hh &&
    calendarCheck.getUTCMinutes() === min;
  if (!valid) throw new Error("消費日無效");
  return iso;
}

function parseAmount(value: string) {
  const normalized = normalizeSpaces(value).replace(/[$,元\s]/g, "");
  if (!/^\d+$/.test(normalized)) throw new Error("消費金額格式不符");
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("消費金額無效");
  return amount;
}

function parseCardLabel(value: string) {
  const normalized = normalizeSpaces(value);
  const role: CtbcCardRole = normalized.includes("(正卡)")
    ? "primary"
    : normalized.includes("(附卡)")
      ? "supplementary"
      : "unknown";
  const cardProductName = normalizeSpaces(normalized.replace(/\((?:正卡|附卡)\)/g, ""));
  if (!cardProductName) throw new Error("卡別格式不符");
  return { cardProductName, role };
}

function parseType(value: string) {
  const normalized = normalizeSpaces(value);
  const channel = TRANSACTION_CHANNELS.find((candidate) => normalized.endsWith(candidate)) ?? null;
  if (!channel) return { bankCategoryRaw: normalized || null, transactionChannelRaw: null };
  const category = normalizeSpaces(normalized.slice(0, -channel.length));
  return {
    bankCategoryRaw: category || null,
    transactionChannelRaw: channel,
  };
}

function parseRow(cells: string[]): ParsedRow {
  if (cells.length !== EXPECTED_HEADERS.length) throw new Error("交易欄位數量不符");
  const cardLast4 = normalizeSpaces(cells[1] ?? "");
  if (!/^\d{4}$/.test(cardLast4)) throw new Error("末四碼格式不符");
  const merchantRaw = normalizeSpaces(cells[4] ?? "");
  if (!merchantRaw) throw new Error("商店名稱缺失");

  return {
    cardLabel: normalizeSpaces(cells[0] ?? ""),
    cardLast4,
    occurredAt: parseOccurredAt(cells[2] ?? ""),
    amountTwd: parseAmount(cells[3] ?? ""),
    merchantRaw,
    typeRaw: normalizeSpaces(cells[5] ?? ""),
  };
}

function rowHash(row: ParsedRow) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        row.cardLabel,
        row.cardLast4,
        row.occurredAt,
        row.amountTwd,
        row.merchantRaw,
        row.typeRaw,
      ]),
    )
    .digest("hex");
}

function toCandidate(messageId: string, row: ParsedRow): CtbcEmailCandidate {
  const { cardProductName, role } = parseCardLabel(row.cardLabel);
  const { bankCategoryRaw, transactionChannelRaw } = parseType(row.typeRaw);
  const merchantUnknown = row.merchantRaw === "暫無商店資訊";
  const warnings = [
    "成交回報尚未經月結帳單核對",
    ...(merchantUnknown ? ["商店名稱尚未提供，必須人工確認"] : []),
  ];
  const confidence = merchantUnknown ? 0.7 : 0.85;

  return {
    source: "ctbc_email_alert",
    gmailMessageId: messageId,
    sourceId: `ctbc:${messageId}:${rowHash(row)}`,
    occurredAt: row.occurredAt,
    amountTwd: row.amountTwd,
    currency: "TWD",
    cardProductName,
    cardRole: role,
    cardLast4: row.cardLast4,
    merchantRaw: row.merchantRaw,
    merchantNormalized: merchantUnknown ? null : row.merchantRaw,
    bankCategoryRaw,
    transactionChannelRaw,
    suggestedCategoryId: null,
    suggestedPaymentMethodId: null,
    confidence,
    warnings,
    status: "authorized_unreconciled",
  };
}

function parseCandidateRows(messageId: string, rows: string[][]) {
  const candidates: CtbcEmailCandidate[] = [];
  const errors: string[] = [];
  const seenSourceIds = new Set<string>();

  rows.forEach((cells, index) => {
    try {
      const candidate = toCandidate(messageId, parseRow(cells));
      if (!seenSourceIds.has(candidate.sourceId)) {
        seenSourceIds.add(candidate.sourceId);
        candidates.push(candidate);
      }
    } catch (error) {
      errors.push(`第 ${index + 1} 列：${error instanceof Error ? error.message : "解析失敗"}`);
    }
  });

  return { candidates, errors };
}

export function parseCtbcEmail(input: CtbcEmailInput): CtbcEmailParseResult {
  const messageId = input.messageId.trim();
  if (!messageId) {
    return {
      accepted: false,
      status: "rejected",
      messageId: "",
      candidates: [],
      errors: ["缺少 Gmail message ID"],
    };
  }

  if (!isAcceptedSource(input)) {
    return {
      accepted: false,
      status: "rejected",
      messageId,
      candidates: [],
      errors: ["寄件者、主旨或郵件驗證結果不符合中國信託成交回報 allowlist"],
    };
  }

  const htmlRows = input.html?.trim() ? candidateHtmlRows(input.html) : [];
  const textRows = input.text?.trim() ? candidateTextRows(input.text) : [];

  if (htmlRows.length === 0 && textRows.length === 0) {
    return {
      accepted: true,
      status: "parse_failed",
      messageId,
      candidates: [],
      errors: ["找不到符合六欄格式的交易表格"],
    };
  }

  const htmlResult = parseCandidateRows(messageId, htmlRows);
  const result =
    htmlResult.candidates.length === 0 && textRows.length > 0
      ? parseCandidateRows(messageId, textRows)
      : htmlResult;

  return {
    accepted: true,
    status: result.candidates.length > 0 ? "parsed" : "parse_failed",
    messageId,
    candidates: result.candidates,
    errors: result.errors,
  };
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function buildCtbcDryRunReport(result: CtbcEmailParseResult): CtbcDryRunReport {
  return {
    dryRun: true,
    accepted: result.accepted,
    status: result.status,
    messageIdHash: shortHash(result.messageId),
    candidateCount: result.candidates.length,
    errorCount: result.errors.length,
    errors: result.errors,
    candidates: result.candidates.map((candidate, index) => ({
      index: index + 1,
      occurredDate: candidate.occurredAt.slice(0, 10),
      amount: "[REDACTED]",
      card: "[REDACTED]",
      merchant: "[REDACTED]",
      cardRole: candidate.cardRole,
      bankCategoryRaw: candidate.bankCategoryRaw,
      transactionChannelRaw: candidate.transactionChannelRaw,
      warningCount: candidate.warnings.length,
      sourceIdHash: shortHash(candidate.sourceId),
    })),
  };
}
