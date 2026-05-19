import { format, parseISO, subDays } from "date-fns";

type MatchableOption = {
  id: string;
  name: string;
};

export type HermesTransactionParseOptions = {
  categories: MatchableOption[];
  paymentMethods: MatchableOption[];
  baseDate: string;
};

export type HermesTransactionParseResult = {
  amount: number | null;
  date: string;
  categoryId: string | null;
  categoryName: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  note: string;
  confidence: number;
  warnings: string[];
};

export type HermesTransactionContext = Record<string, unknown>;

export type HermesTransactionInsert = {
  user_id: string;
  amount: number;
  date: string;
  category_id: string;
  payment_method_id: string;
  note: string;
  source: "hermes";
  source_text: string;
  source_id: string | null;
  metadata: {
    hermes: {
      parserVersion: 1;
      confidence: number;
      warnings: string[];
      matchedCategoryName: string | null;
      matchedPaymentMethodName: string | null;
      context: HermesTransactionContext;
    };
  };
};

const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/;
const AMOUNT_PATTERN = /(?:^|\s)(\d+(?:,\d{3})*|\d+)(?:\s|$)/;

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function removeFirst(value: string, target: string) {
  if (!target) return value;
  return normalizeSpaces(value.replace(target, " "));
}

function findLongestIncludedOption(text: string, options: MatchableOption[]) {
  const normalizedText = text.toLocaleLowerCase("zh-TW");
  return [...options]
    .sort((a, b) => b.name.length - a.name.length)
    .find((option) => normalizedText.includes(option.name.toLocaleLowerCase("zh-TW"))) ?? null;
}

function resolveDate(text: string, baseDate: string) {
  const isoDate = text.match(ISO_DATE_PATTERN)?.[0];
  if (isoDate) {
    return { date: isoDate, token: isoDate };
  }

  if (text.includes("昨天")) {
    return { date: format(subDays(parseISO(baseDate), 1), "yyyy-MM-dd"), token: "昨天" };
  }

  if (text.includes("今天")) {
    return { date: baseDate, token: "今天" };
  }

  return { date: baseDate, token: null };
}

export function parseHermesTransactionText(
  rawText: string,
  options: HermesTransactionParseOptions,
): HermesTransactionParseResult {
  const text = normalizeSpaces(rawText);
  const dateResult = resolveDate(text, options.baseDate);
  const amountMatch = text.match(AMOUNT_PATTERN);
  const amountToken = amountMatch?.[1] ?? null;
  const amount = amountToken ? Number(amountToken.replace(/,/g, "")) : null;
  const category = findLongestIncludedOption(text, options.categories);
  const paymentMethod = findLongestIncludedOption(text, options.paymentMethods);

  let note = text;
  if (dateResult.token) note = removeFirst(note, dateResult.token);
  if (amountToken) note = removeFirst(note, amountToken);
  if (paymentMethod) note = removeFirst(note, paymentMethod.name);
  if (category) note = removeFirst(note, category.name);

  const warnings: string[] = [];
  if (!amount || amount <= 0) warnings.push("缺少金額");
  if (!category) warnings.push("找不到分類");
  if (!paymentMethod) warnings.push("找不到支付方式");

  const confidence = Math.max(
    0,
    Math.min(1, 0.4 + (amount ? 0.2 : 0) + (category ? 0.2 : 0) + (paymentMethod ? 0.2 : 0) - warnings.length * 0.05),
  );

  return {
    amount: amount && amount > 0 ? amount : null,
    date: dateResult.date,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    paymentMethodId: paymentMethod?.id ?? null,
    paymentMethodName: paymentMethod?.name ?? null,
    note,
    confidence,
    warnings,
  };
}

export function buildHermesTransactionInsert({
  userId,
  rawText,
  parsed,
  sourceId = null,
  context = {},
}: {
  userId: string;
  rawText: string;
  parsed: HermesTransactionParseResult;
  sourceId?: string | null;
  context?: HermesTransactionContext;
}): HermesTransactionInsert {
  if (!parsed.amount) throw new Error("缺少金額");
  if (!parsed.categoryId) throw new Error("缺少分類");
  if (!parsed.paymentMethodId) throw new Error("缺少支付方式");

  return {
    user_id: userId,
    amount: parsed.amount,
    date: parsed.date,
    category_id: parsed.categoryId,
    payment_method_id: parsed.paymentMethodId,
    note: parsed.note,
    source: "hermes",
    source_text: rawText,
    source_id: sourceId,
    metadata: {
      hermes: {
        parserVersion: 1,
        confidence: parsed.confidence,
        warnings: parsed.warnings,
        matchedCategoryName: parsed.categoryName,
        matchedPaymentMethodName: parsed.paymentMethodName,
        context,
      },
    },
  };
}
