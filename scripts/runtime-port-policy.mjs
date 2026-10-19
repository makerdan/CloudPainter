import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

// These are data, not listeners or executable target URLs. Match the precise
// file AND literal; a new fixture needs its own inspected rule, not a test-dir waiver.
const DATA_LITERALS = [
  {
    file: "scripts/tests/browser-safety-lanes.test.mjs",
    text: "http://" + "127.0.0.1:" + "4173/api/images/generate?prompt=private",
    line: text => `request: () => ({ url: () => '${text}' }),`,
    reason: "Synthetic request.url() data passed to the provider-request guard; no network dispatch.",
  },
  {
    file: "scripts/ci/api-test-coverage.test.mjs",
    text: "postgresql://" + "postgres:ci-test-password@127.0.0.1:" + "5432/cloudpainter_test",
    line: text => `const disposableDatabaseUrl = '${text}';`,
    reason: "Expected CI service configuration parsed by URL and compared against a shell-stub log, not connected to a database.",
  },
  {
    file: "scripts/ci/api-test-coverage.test.mjs",
    text: "postgresql://" + "fixture-user:fixture-password@shared-db.invalid:" + "5432/shared",
    line: text => [`'${text}',`, `['shared database URL', '${text}'],`, `const sharedTarget = '${text}';`],
    reason: "Exact rejected shared-target strings used by the CI shell-stub guard, never real database connections.",
  },
  {
    file: "artifacts/api-server/tests/logo-images.test.ts",
    text: "https://" + "pfst.cf2.poecdn.net:" + "8443/image.png)",
    line: text => `poeReply("![bad](${text}"),`,
    reason: "Exact invalid-port Poe response data in the extractPoeImageUrl rejection case; not a fetch target.",
  },
  {
    file: "lib/integrations-openai-ai-server/tests/poe-image.test.ts",
    text: "https://" + "pfst.cf2.poecdn.net:" + "444/a.png",
    line: text => `for (const url of ["http://pfst.cf2.poecdn.net/a.png", "https://127.0.0.1/a.png", "https://pfst.cf2.poecdn.net.evil.test/a.png", "https://user:pass@pfst.cf2.poecdn.net/a.png", "${text}"]) assert.throws(() => assertPoeMediaUrl(url));`,
    reason: "Exact assertPoeMediaUrl invalid-port input, asserted to throw before any network dispatch.",
  },
];

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const TEXT_EXT = /\.(?:py|sh|bash|ya?ml|toml|json|md|txt)$/;
const URL_PORT = /\b[a-z][a-z\d+.-]*:\/\/(?:[^/\s"'`<>]*@)?(?:\[[a-f\d:]+\]|[\w.-]+):(\d+)(?=[/\s"'`<>?#]|$)(?:[/?#][^\s"'`<>]*)?/gi;
const FIXED_BIND = [
  [/\b(?:PORT|[A-Z_]*_PORT)\s*=\s*["']?(\d+)\b/g, "environment-assignment"],
  [/(?:--port|--listen-port)(?:=|\s+)["']?(\d+)\b/g, "port-option"],
  [/\$\{(?:PORT|[A-Z_]*_PORT):[-=](\d+)\}/g, "environment-port-fallback"],
  [/\b(?:port|listen_port|localPort)\s*[:=]\s*["']?(\d+)\b/g, "port-configuration"],
  [/\.(?:listen|bind)\s*\(\s*["']?(\d+)\b/g, "service-bind"],
  [/\.bind\s*\(\s*\(\s*["'][^"']*["']\s*,\s*(\d+)\b/g, "service-bind"],
];

function maskedComments(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  let result = "", end = 0;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      const start = scanner.getTokenPos();
      result += text.slice(end, start) + text.slice(start, scanner.getTextPos()).replace(/[^\n]/g, " ");
      end = scanner.getTextPos();
    }
  }
  return result + text.slice(end);
}

function platformConfiguration(file, line) {
  // Artifact manifests own their service routing and service.env PORT. This
  // does not exempt run/build commands embedded in those same manifests.
  return /^artifacts\/[^/]+\/\.replit-artifact\/artifact\.toml$/.test(file) &&
    /^\s*(?:localPort|PORT)\s*=\s*["']?\d+["']?\s*$/.test(line);
}

function markdownLines(text) {
  let fence = false, executable = false, example = false;
  return text.split("\n").map(line => {
    const opening = line.match(/^\s*(```+|~~~+)\s*([\w-]*)(.*)$/);
    if (opening) {
      if (fence) { fence = false; executable = false; }
      else {
        fence = true;
        executable = /^(?:sh|shell|bash|console|js|javascript|ts|typescript|python|py|json|ya?ml|toml)$/.test(opening[2]);
        example = /\bexample\b/i.test(opening[3]);
      }
      return "";
    }
    if (fence) return executable && !example ? line : "";
    // Historical result records and an explicitly labelled example are not
    // executable instructions. Other command spans remain scanned.
    if (/\bthat example port\b/i.test(line)) return "";
    if (/^\s*-\s+`[^`]+`(?:\s+—|\s*:)\s+(?:passed\b|\d+\/\d+\s+passed\b)/i.test(line)) return "";
    return [...line.matchAll(/`([^`]+)`/g)].map(m => m[1]).join(" ");
  });
}

export function scanText(file, text) {
  const findings = [], exceptions = [];
  const add = (line, rule) => {
    if (!findings.some(f => f.line === line && f.rule === rule)) findings.push({ file, line, rule });
  };
  const lines = file.endsWith(".md") ? markdownLines(text) : (SOURCE_EXT.test(file) ? maskedComments(text) : text).split("\n");
  for (const [i, line] of lines.entries()) {
    if (platformConfiguration(file, line)) {
      exceptions.push({ file, line: i + 1, reason: "Host-owned artifact service port configuration." });
      continue;
    }
    for (const match of line.matchAll(URL_PORT)) {
      const dataRule = DATA_LITERALS.find(rule => rule.file === file && rule.text === match[0] &&
        [rule.line(rule.text)].flat().includes(line.trim()));
      if (dataRule) exceptions.push({ file, line: i + 1, reason: dataRule.reason });
      else add(i + 1, "hardcoded-url-port");
    }
    for (const [pattern, rule] of FIXED_BIND) {
      for (const match of line.matchAll(pattern)) {
        // Only the actual listen/bind API has the OS ephemeral reservation
        // contract. Zero in a URL, config, flag or environment is NOT exempt.
        if (rule === "service-bind" && Number(match[1]) === 0) continue;
        add(i + 1, rule);
      }
    }
  }
  if (SOURCE_EXT.test(file)) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
      file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const declarations = new Map();
    const visitDeclarations = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const list = declarations.get(node.name.text) ?? [];
        list.push(node.initializer);
        declarations.set(node.name.text, list);
      }
      ts.forEachChild(node, visitDeclarations);
    };
    visitDeclarations(source);
    function fixed(node, seen = new Set()) {
      if (!node) return false;
      if (ts.isNumericLiteral(node) || ts.isStringLiteral(node)) return /^\d+$/.test(node.text);
      if (ts.isIdentifier(node) && !seen.has(node.text)) {
        const next = new Set([...seen, node.text]);
        return (declarations.get(node.text) ?? []).some(value => fixed(value, next));
      }
      if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return fixed(node.expression, seen);
      if (ts.isBinaryExpression(node) || ts.isConditionalExpression(node)) {
        return ts.isBinaryExpression(node) ? fixed(node.left, seen) || fixed(node.right, seen) :
          fixed(node.whenTrue, seen) || fixed(node.whenFalse, seen);
      }
      if (ts.isCallExpression(node) && /^(?:Number|parseInt)$/.test(node.expression.getText(source))) return fixed(node.arguments[0], seen);
      return false;
    }
    const visit = node => {
      let input;
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          /^(?:listen|bind)$/.test(node.expression.name.text)) {
        input = node.arguments[0];
        if (input && ts.isObjectLiteralExpression(input)) {
          input = input.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === "port")?.initializer;
        }
        if (input && input.getText(source) === "0") input = undefined;
      } else if (ts.isPropertyAssignment(node) && /^(?:port|listen_port)$/.test(node.name.getText(source).replace(/['"]/g, ""))) {
        input = node.initializer;
      }
      if (input && fixed(input)) add(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, "fixed-service-port");
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { findings, exceptions };
}

export function scanRepository(root) {
  // Include new untracked source, but never ignored runtime state, secrets or
  // generated build outputs. Inventory failure is not a successful empty scan.
  const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 4_000_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  });
  if (listed.error || listed.status !== 0 || !listed.stdout) throw new Error("Runtime port inventory unavailable");
  const files = [...new Set(listed.stdout.split("\0").filter(Boolean))].sort().filter(file => {
    if (/(?:^|\/)(?:node_modules|dist|generated-artifacts|\.local|attached_assets)\//.test(file)) return false;
    // Skill packages, authored specifications and fixture snapshots are not
    // application executables. No application/scripts/tests directory is exempt.
    if (file.startsWith(".agents/") || file === "docs/validation/evidence/runtime-tiers-before.json") return false;
    return file === ".replit" || SOURCE_EXT.test(file) || TEXT_EXT.test(file);
  });
  const findings = [], exceptions = [];
  for (const file of files) {
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(path.resolve(root) + path.sep)) throw new Error("Runtime port inventory escapes repository");
    let cursor = path.resolve(root);
    for (const part of file.split("/")) {
      cursor = path.join(cursor, part);
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error("Runtime port inventory contains a symlink: " + file);
    }
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > 4_000_000) throw new Error("Runtime port input is not a bounded regular file: " + file);
    const result = scanText(file, fs.readFileSync(absolute, "utf8"));
    findings.push(...result.findings);
    exceptions.push(...result.exceptions);
  }
  return { files: files.length, findings, exceptions };
}
