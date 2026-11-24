#!/usr/bin/env node
// 取得 CTBC 收件匣 worker 需要的 Gmail「唯讀」授權（refresh token）。
//
// 用法：
//   node scripts/ctbc-gmail-auth.mjs <Google 下載的 OAuth 用戶端 JSON 路徑>
//
// 會開啟瀏覽器請你登入並同意；完成後把三個值寫到 JSON 檔旁邊的
// ctbc-gmail-credentials.txt。金鑰值不會印在畫面上。
// JSON 檔與輸出檔都必須放在這個 repo 之外。

import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TIMEOUT_MS = 5 * 60 * 1000;

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

const jsonPath = process.argv[2] ? resolve(process.argv[2]) : null;
if (!jsonPath) fail("請提供 Google 下載的 OAuth 用戶端 JSON 檔路徑。");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!relative(repoRoot, jsonPath).startsWith("..")) {
  fail("JSON 檔在專案資料夾裡，請先搬到專案資料夾之外再執行，避免金鑰被提交。");
}

let client;
try {
  client = JSON.parse(readFileSync(jsonPath, "utf8")).installed;
} catch {
  fail("讀不到這個 JSON 檔，請確認路徑。");
}
if (!client?.client_id || !client?.client_secret) {
  fail("這個 JSON 不是「電腦版應用程式」類型的 OAuth 用戶端，請重新建立並下載。");
}

const state = randomBytes(16).toString("hex");
const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

const server = createServer();
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const redirectUri = `http://127.0.0.1:${server.address().port}`;

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: client.client_id,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: SCOPE,
  access_type: "offline",
  prompt: "consent",
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
})}`;

const code = await new Promise((ok) => {
  const timer = setTimeout(() => fail("等了 5 分鐘沒有完成授權，請重新執行。"), TIMEOUT_MS);
  server.on("request", (req, res) => {
    const url = new URL(req.url ?? "/", redirectUri);
    if (!url.searchParams.has("state")) {
      res.writeHead(404).end();
      return;
    }
    const good = url.searchParams.get("state") === state && url.searchParams.get("code");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      good
        ? "<h2>授權完成，可以關掉這個分頁回到終端機。</h2>"
        : "<h2>授權沒有完成，請回到終端機重新執行。</h2>",
    );
    clearTimeout(timer);
    if (!good) fail("授權被取消或驗證碼不符。");
    ok(url.searchParams.get("code"));
  });

  console.log("正在開啟瀏覽器，請登入收中信通知信的 Gmail 並按同意。");
  console.log("如果瀏覽器沒有自動開啟，請手動複製這個網址（不含金鑰）：\n");
  console.log(authUrl);
  const opener =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", authUrl.replaceAll("&", "^&")]]
      : process.platform === "darwin"
        ? ["open", [authUrl]]
        : ["xdg-open", [authUrl]];
  spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).on("error", () => {});
});
server.close();

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  body: new URLSearchParams({
    client_id: client.client_id,
    client_secret: client.client_secret,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  }),
});
const token = await tokenResponse.json().catch(() => ({}));
if (!tokenResponse.ok || typeof token.refresh_token !== "string") {
  fail(`Google 沒有發出授權（${token.error ?? tokenResponse.status}），請重新執行。`);
}

// worker 只接受「恰好只有 gmail.readonly」的 Gmail 權限，這裡先擋一次。
const scopes = String(token.scope ?? "").split(/\s+/);
if (!scopes.includes(SCOPE) || scopes.some((s) => s.includes("/auth/gmail") && s !== SCOPE) || scopes.includes("https://mail.google.com/")) {
  fail("取得的權限不是「只有 Gmail 唯讀」，worker 會拒絕。請確認同意畫面只列出唯讀權限。");
}

const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
  headers: { Authorization: `Bearer ${token.access_token}` },
});
const profile = await profileResponse.json().catch(() => ({}));
if (!profileResponse.ok || typeof profile.emailAddress !== "string") {
  fail("授權成功但讀不到信箱資料，請確認專案已啟用 Gmail API 後重新執行。");
}
const mailboxSha256 = createHash("sha256")
  .update(profile.emailAddress.trim().toLowerCase())
  .digest("hex");

const outPath = join(dirname(jsonPath), "ctbc-gmail-credentials.txt");
writeFileSync(
  outPath,
  [
    "# CTBC 收件匣 Gmail 唯讀授權。請貼到 Railway worker 服務的環境變數，",
    "# 並存到 Notion「API 金鑰管理」。不要放進 repo、不要貼到對話。",
    `CTBC_GMAIL_CLIENT_ID=${client.client_id}`,
    `CTBC_GMAIL_CLIENT_SECRET=${client.client_secret}`,
    `CTBC_GMAIL_REFRESH_TOKEN=${token.refresh_token}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);

console.log("\n✓ 授權完成。");
console.log(`  三個金鑰值已寫到：${outPath}`);
console.log(`  信箱指紋（mailboxSha256，不是機密）：${mailboxSha256}`);
