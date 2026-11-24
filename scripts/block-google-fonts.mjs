// Build regression guard: dependencies must supply fonts without contacting Google.
// Load with NODE_OPTIONS=--import=./scripts/block-google-fonts.mjs.
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

function denyGoogleFonts(input) {
  const hostname = typeof input === "string" || input instanceof URL
    ? new URL(input).hostname
    : input?.url
      ? new URL(input.url).hostname
      : input?.hostname ?? input?.host?.split(":")[0];
  if (hostname === "fonts.googleapis.com" || hostname === "fonts.gstatic.com") {
    throw new Error("Google Fonts network access is forbidden during build verification");
  }
}

for (const client of [http, https]) {
  for (const method of ["request", "get"]) {
    const original = client[method];
    client[method] = function (input, ...args) {
      denyGoogleFonts(input);
      return Reflect.apply(original, this, [input, ...args]);
    };
  }
}
syncBuiltinESMExports();

const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  denyGoogleFonts(input);
  return originalFetch(input, init);
};
