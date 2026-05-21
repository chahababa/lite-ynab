import { format, parseISO, subDays } from "date-fns";

type MatchableOption = {
  id: string;
  name: string;
  groupName?: string | null;
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
const CATEGORY_SEPARATOR_PATTERN = "(?:\\s+|\\s*[\\/／>]\\s*)";

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function removeFirst(value: string, target: string) {
  if (!target) return value;
  return normalizeSpaces(value.replace(target, " "));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findFirstMatchToken(text: string, pattern: RegExp) {
  return text.match(pattern)?.[0] ?? null;
}

function getDuplicateOptionNames(options: MatchableOption[]) {
  const counts = new Map<string, number>();
  for (const option of options) {
    const key = option.name.toLocaleLowerCase("zh-TW");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function findLongestIncludedOption(text: string, options: MatchableOption[]) {
  const normalizedText = text.toLocaleLowerCase("zh-TW");
  return [...options]
    .sort((a, b) => b.name.length - a.name.length)
    .find((option) => normalizedText.includes(option.name.toLocaleLowerCase("zh-TW"))) ?? null;
}

function findCategoryOption(text: string, options: MatchableOption[]) {
  const duplicateNames = getDuplicateOptionNames(options);
  const sortedOptions = [...options].sort((a, b) => {
    const aQualifiedLength = `${a.groupName ?? ""}${a.name}`.length;
    const bQualifiedLength = `${b.groupName ?? ""}${b.name}`.length;
    return bQualifiedLength - aQualifiedLength;
  });

  for (const option of sortedOptions) {
    if (!option.groupName) continue;

    const qualifiedPattern = new RegExp(
      `${escapeRegExp(option.groupName)}${CATEGORY_SEPARATOR_PATTERN}${escapeRegExp(option.name)}`,
      "i",
    );
    const token = findFirstMatchToken(text, qualifiedPattern);
    if (token) {
      return { option, token, ambiguousName: null };
    }
  }

  const sortedNames = Array.from(new Set(options.map((option) => option.name))).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    const normalizedName = name.toLocaleLowerCase("zh-TW");
    if (!text.toLocaleLowerCase("zh-TW").includes(normalizedName)) continue;

    const matches = options.filter((option) => option.name.toLocaleLowerCase("zh-TW") === normalizedName);
    if ((duplicateNames.get(normalizedName) ?? 0) > 1 || matches.length > 1) {
      return { option: null, token: name, ambiguousName: name };
    }

    return { option: matches[0] ?? null, token: name, ambiguousName: null };
  }

  return { option: null, token: null, ambiguousName: null };
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
  const categoryResult = findCategoryOption(text, options.categories);
  const category = categoryResult.option;
  const paymentMethod = findLongestIncludedOption(text, options.paymentMethods);

  let note = text;
  if (dateResult.token) note = removeFirst(note, dateResult.token);
  if (amountToken) note = removeFirst(note, amountToken);
  if (paymentMethod) note = removeFirst(note, paymentMethod.name);
  if (categoryResult.token) note = removeFirst(note, categoryResult.token);

  const warnings: string[] = [];
  if (!amount || amount <= 0) warnings.push("缺少金額");
  if (categoryResult.ambiguousName) {
    warnings.push(`分類「${categoryResult.ambiguousName}」同時存在於多個大項，請指定大項（例如：家庭 ${categoryResult.ambiguousName}）`);
  } else if (!category) {
    warnings.push("找不到分類");
  }
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
