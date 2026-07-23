#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import ts from "typescript";

const parserSource = await readFile(new URL("../src/lib/ctbcEmailParser.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(parserSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  reportDiagnostics: true,
});
const transpileErrors = (transpiled.diagnostics ?? []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
if (transpileErrors.length > 0) {
  throw new Error("Unable to transpile CTBC parser for dry-run");
}
const parserModuleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { buildCtbcDryRunReport, parseCtbcEmail } = await import(parserModuleUrl);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run dry-run:ctbc-email -- <synthetic-email.json|->");
  process.exitCode = 2;
} else {
  try {
    const raw = inputPath === "-" ? await readStdin() : await readFile(inputPath, "utf8");
    const input = JSON.parse(raw);
    const report = buildCtbcDryRunReport(parseCtbcEmail(input));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.accepted || report.status === "parse_failed" || report.errorCount > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to run CTBC email dry-run");
    process.exitCode = 1;
  }
}
