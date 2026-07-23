import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import syntheticEmail from "@/test-fixtures/ctbc-email-alert.synthetic.json";
import {
  buildCtbcDryRunReport,
  CTBC_ALERT_SENDER,
  parseCtbcEmail,
  type CtbcEmailInput,
} from "@/lib/ctbcEmailParser";

function input(overrides: Partial<CtbcEmailInput> = {}): CtbcEmailInput {
  return {
    ...syntheticEmail,
    ...overrides,
  };
}

describe("parseCtbcEmail", () => {
  it("parses the smallest six-column transaction table without duplicating nested wrapper content", () => {
    const result = parseCtbcEmail(input());

    expect(result.status).toBe("parsed");
    expect(result.errors).toEqual([]);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((candidate) => candidate.cardRole)).toEqual([
      "primary",
      "supplementary",
      "primary",
    ]);
    expect(result.candidates[0]).toMatchObject({
      amountTwd: 1280,
      occurredAt: "2026-07-22T09:15:00+08:00",
      cardProductName: "旅遊聯名卡",
      cardLast4: "1234",
      merchantRaw: "範例餐廳",
      merchantNormalized: "範例餐廳",
      bankCategoryRaw: "餐飲美食",
      transactionChannelRaw: "行動支付",
      status: "authorized_unreconciled",
    });
    expect(result.candidates[1]).toMatchObject({
      merchantRaw: "暫無商店資訊",
      merchantNormalized: null,
      bankCategoryRaw: "量販超市/食品",
      transactionChannelRaw: "非實體卡交易",
      confidence: 0.7,
    });
    expect(result.candidates[1]?.warnings).toContain("商店名稱尚未提供，必須人工確認");
    expect(result.candidates[2]).toMatchObject({
      bankCategoryRaw: null,
      transactionChannelRaw: "非實體卡交易",
    });
  });

  it("rejects spoofed senders and unrelated subjects before parsing", () => {
    const spoofed = parseCtbcEmail(input({ from: `中國信託銀行 <attacker@example.com>` }));
    const unrelated = parseCtbcEmail(input({ subject: "信用卡繳款入帳通知" }));
    const unauthenticated = parseCtbcEmail(input({ authenticationResults: "dkim=fail; spf=fail; dmarc=fail" }));
    const missingAuthentication = parseCtbcEmail(input({ authenticationResults: undefined as never }));

    expect(spoofed).toMatchObject({ accepted: false, status: "rejected", candidates: [] });
    expect(unrelated).toMatchObject({ accepted: false, status: "rejected", candidates: [] });
    expect(unauthenticated).toMatchObject({ accepted: false, status: "rejected", candidates: [] });
    expect(missingAuthentication).toMatchObject({ accepted: false, status: "rejected", candidates: [] });
  });

  it("rejects forged suffix domains and mixed fail/pass authentication results", () => {
    const suffixDomain = parseCtbcEmail(
      input({
        authenticationResults:
          "mx.google.com; dkim=pass header.i=@inib.ctbcbank.com.evil; spf=pass smtp.mailfrom=x@inib.ctbcbank.com.evil; dmarc=pass header.from=inib.ctbcbank.com.evil",
      }),
    );
    const mixedVerdicts = parseCtbcEmail(
      input({
        authenticationResults:
          "mx.google.com; dkim=fail header.i=@attacker.example; dkim=pass header.i=@inib.ctbcbank.com; spf=pass smtp.mailfrom=x@inib.ctbcbank.com; dmarc=pass header.from=inib.ctbcbank.com",
      }),
    );
    const invalidPassToken = parseCtbcEmail(
      input({
        authenticationResults:
          "mx.google.com; dkim=pass.evil header.i=@inib.ctbcbank.com; spf=pass.evil smtp.mailfrom=x@inib.ctbcbank.com; dmarc=pass.evil header.from=inib.ctbcbank.com",
      }),
    );
    const prefixedMethods = parseCtbcEmail(
      input({
        authenticationResults:
          "mx.google.com; xdkim=pass header.i=@inib.ctbcbank.com; xspf=pass smtp.mailfrom=x@inib.ctbcbank.com; xdmarc=pass header.from=inib.ctbcbank.com",
      }),
    );
    const metadataInjection = parseCtbcEmail(
      input({
        authenticationResults:
          "mx.google.com; arc=pass reason=dkim=pass header.i=@inib.ctbcbank.com spf=pass smtp.mailfrom=x@inib.ctbcbank.com dmarc=pass header.from=inib.ctbcbank.com",
      }),
    );

    expect(suffixDomain.status).toBe("rejected");
    expect(mixedVerdicts.status).toBe("rejected");
    expect(invalidPassToken.status).toBe("rejected");
    expect(prefixedMethods.status).toBe("rejected");
    expect(metadataInjection.status).toBe("rejected");
  });

  it("creates deterministic distinct source ids and deduplicates duplicate rows within one message", () => {
    const duplicateRow =
      "<tr><td>旅遊聯名卡 (正卡)</td><td>1234</td><td>2026/07/22 09:15</td><td>$1,280 元</td><td>範例餐廳</td><td>餐飲美食 行動支付</td></tr>";
    const html = `<table><tr><th>卡別</th><th>末四碼</th><th>消費日</th><th>消費金額</th><th>商店名稱</th><th>商店類型│交易類型</th></tr>${duplicateRow}${duplicateRow}<tr><td>旅遊聯名卡 (附卡)</td><td>5678</td><td>2026/07/22 09:15</td><td>$1,280 元</td><td>範例餐廳</td><td>餐飲美食 行動支付</td></tr></table>`;

    const first = parseCtbcEmail(input({ html }));
    const second = parseCtbcEmail(input({ html }));

    expect(first.candidates).toHaveLength(2);
    expect(new Set(first.candidates.map((candidate) => candidate.sourceId)).size).toBe(2);
    expect(second.candidates.map((candidate) => candidate.sourceId)).toEqual(
      first.candidates.map((candidate) => candidate.sourceId),
    );
  });

  it("keeps valid rows and reports malformed rows instead of silently dropping them", () => {
    const html = `<table>
      <tr><th>卡別</th><th>末四碼</th><th>消費日</th><th>消費金額</th><th>商店名稱</th><th>商店類型│交易類型</th></tr>
      <tr><td>旅遊聯名卡 (正卡)</td><td>1234</td><td>2026/07/22 09:15</td><td>$500 元</td><td>範例商家</td><td>餐飲美食 實體卡交易</td></tr>
      <tr><td>旅遊聯名卡 (正卡)</td><td>1234</td><td>2026/07/22 10:15</td><td>金額不明</td><td>另一商家</td><td>餐飲美食 實體卡交易</td></tr>
    </table>`;

    const result = parseCtbcEmail(input({ html }));

    expect(result.status).toBe("parsed");
    expect(result.candidates).toHaveLength(1);
    expect(result.errors).toEqual(["第 2 列：消費金額格式不符"]);
  });

  it("reports rows with the wrong number of fields instead of silently filtering them", () => {
    const html = `<table>
      <tr><th>卡別</th><th>末四碼</th><th>消費日</th><th>消費金額</th><th>商店名稱</th><th>商店類型│交易類型</th></tr>
      <tr><td>旅遊聯名卡 (正卡)</td><td>1234</td><td>2026/07/22 09:15</td><td>$500 元</td><td>範例商家</td><td>餐飲美食 實體卡交易</td></tr>
      <tr><td>旅遊聯名卡 (正卡)</td><td>1234</td><td>2026/07/22 10:15</td><td>$300 元</td><td>缺少交易類型</td></tr>
    </table>`;

    const result = parseCtbcEmail(input({ html }));

    expect(result.candidates).toHaveLength(1);
    expect(result.errors).toEqual(["第 2 列：交易欄位數量不符"]);
  });

  it("rejects impossible calendar dates instead of allowing Date normalization", () => {
    const html = `<table>
      <tr><th>卡別</th><th>末四碼</th><th>消費日</th><th>消費金額</th><th>商店名稱</th><th>商店類型│交易類型</th></tr>
      <tr><td>旅遊聯名卡 (正卡)</td><td>1234</td><td>2026/02/31 09:15</td><td>$500 元</td><td>範例商家</td><td>餐飲美食 實體卡交易</td></tr>
    </table>`;

    const result = parseCtbcEmail(input({ html }));

    expect(result.status).toBe("parse_failed");
    expect(result.errors).toEqual(["第 1 列：消費日無效"]);
  });

  it("falls back to a tab-separated text table when HTML is unavailable", () => {
    const text = [
      "卡別\t末四碼\t消費日\t消費金額\t商店名稱\t商店類型│交易類型",
      "旅遊聯名卡 (正卡)\t1234\t2026/07/22 09:15\t$500 元\t範例商家\t餐飲美食 實體卡交易",
    ].join("\n");

    const result = parseCtbcEmail(input({ html: null, text }));

    expect(result.status).toBe("parsed");
    expect(result.candidates).toHaveLength(1);
  });

  it("falls back to valid plain text when a non-empty HTML part has no transaction table", () => {
    const text = [
      "卡別\t末四碼\t消費日\t消費金額\t商店名稱\t商店類型│交易類型",
      "旅遊聯名卡 (正卡)\t1234\t2026/07/22 09:15\t$500 元\t範例商家\t餐飲美食 實體卡交易",
    ].join("\n");

    const result = parseCtbcEmail(input({ html: "<html><body>無有效表格</body></html>", text }));

    expect(result.status).toBe("parsed");
    expect(result.candidates).toHaveLength(1);
  });

  it("falls back to valid plain text when HTML rows exist but all fail validation", () => {
    const html = `<table>
      <tr><th>卡別</th><th>末四碼</th><th>消費日</th><th>消費金額</th><th>商店名稱</th><th>商店類型│交易類型</th></tr>
      <tr><td>旅遊聯名卡 (正卡)</td><td>BAD</td><td>2026/07/22 09:15</td><td>$500 元</td><td>範例商家</td><td>餐飲美食 實體卡交易</td></tr>
    </table>`;
    const text = [
      "卡別\t末四碼\t消費日\t消費金額\t商店名稱\t商店類型│交易類型",
      "旅遊聯名卡 (正卡)\t1234\t2026/07/22 09:15\t$500 元\t範例商家\t餐飲美食 實體卡交易",
    ].join("\n");

    const result = parseCtbcEmail(input({ html, text }));

    expect(result.status).toBe("parsed");
    expect(result.errors).toEqual([]);
    expect(result.candidates[0]?.cardLast4).toBe("1234");
  });

  it("reports malformed text rows and continues checking later transaction rows", () => {
    const text = [
      "卡別\t末四碼\t消費日\t消費金額\t商店名稱\t商店類型│交易類型",
      "旅遊聯名卡 (正卡)\t1234\t2026/07/22 09:15\t$500 元\t第一範例商家\t餐飲美食 實體卡交易",
      "損壞資料列",
      "旅遊聯名卡 (正卡)\t1234\t2026/07/22 10:15\t$300 元\t第二範例商家\t餐飲美食 實體卡交易",
      "註：商店名稱僅供參考",
      "頁尾不應成為錯誤",
    ].join("\n");

    const result = parseCtbcEmail(input({ html: null, text }));

    expect(result.candidates).toHaveLength(2);
    expect(result.errors).toEqual(["第 2 列：交易欄位數量不符"]);
  });

  it("normalizes three-digit Taiwan calendar years used by the real CTBC template", () => {
    const html = `<table>
      <tr><th>卡別</th><th>末四碼</th><th>消費日</th><th>消費金額</th><th>商店名稱</th><th>商店類型│交易類型</th></tr>
      <tr><td>旅遊聯名卡 (正卡)</td><td>1234</td><td>115/07/22 09:15</td><td>$500 元</td><td>範例商家</td><td>餐飲美食 實體卡交易</td></tr>
    </table>`;

    const result = parseCtbcEmail(input({ html }));

    expect(result.candidates[0]?.occurredAt).toBe("2026-07-22T09:15:00+08:00");
  });

  it("returns parse_failed when an accepted message has no valid transaction table", () => {
    const result = parseCtbcEmail(input({ html: "<html><body>沒有交易表格</body></html>" }));

    expect(result).toMatchObject({
      accepted: true,
      status: "parse_failed",
      candidates: [],
      errors: ["找不到符合六欄格式的交易表格"],
    });
  });

  it("requires a Gmail message id for replay-safe source ids", () => {
    const result = parseCtbcEmail(input({ messageId: "" }));

    expect(result).toMatchObject({ accepted: false, status: "rejected", errors: ["缺少 Gmail message ID"] });
  });
});

describe("buildCtbcDryRunReport", () => {
  it("redacts financial and identity fields from dry-run output", () => {
    const report = buildCtbcDryRunReport(parseCtbcEmail(input()));
    const serialized = JSON.stringify(report);

    expect(report.candidateCount).toBe(3);
    expect(serialized).not.toContain(CTBC_ALERT_SENDER);
    expect(serialized).not.toContain("synthetic-ctbc-message-001");
    expect(serialized).not.toContain("1234");
    expect(serialized).not.toContain("1280");
    expect(serialized).not.toContain("範例餐廳");
    expect(serialized).not.toContain("EXAMPLE STREAMING");
    expect(report.candidates[0]).toMatchObject({
      amount: "[REDACTED]",
      card: "[REDACTED]",
      merchant: "[REDACTED]",
    });
  });

  it("makes the CLI fail closed when only part of an email can be parsed", () => {
    const command = spawnSync(
      process.execPath,
      ["scripts/ctbc-email-dry-run.mjs", "src/test-fixtures/ctbc-email-alert.partial.synthetic.json"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(command.status).toBe(1);
    const report = JSON.parse(command.stdout) as { candidateCount: number; errorCount: number };
    expect(report).toMatchObject({ candidateCount: 1, errorCount: 1 });
    expect(command.stderr).toBe("");

    const textInput = input({
      html: null,
      text: [
        "卡別\t末四碼\t消費日\t消費金額\t商店名稱\t商店類型│交易類型",
        "旅遊聯名卡 (正卡)\t1234\t2026/07/22 09:15\t$500 元\t範例商家\t餐飲美食 實體卡交易",
        "損壞資料列",
      ].join("\n"),
    });
    const textCommand = spawnSync(process.execPath, ["scripts/ctbc-email-dry-run.mjs", "-"], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: JSON.stringify(textInput),
    });

    expect(textCommand.status).toBe(1);
    expect(JSON.parse(textCommand.stdout)).toMatchObject({ candidateCount: 1, errorCount: 1 });
  });
});
