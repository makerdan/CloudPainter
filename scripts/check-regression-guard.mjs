#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(SCRIPT_DIR);
const DEFAULT_PLAN_DIR = path.join(PROJECT_ROOT, ".local", "tasks");
const GUARD_HEADING = /^## Regression Guard\s*$/gm;
const PLACEHOLDER = /<[^>\n]*>|\b(?:TBD|TODO|FILL\s*IN|PLACEHOLDER|INSERT\s+(?:TEXT|VALUE|HERE))\b|\[(?:FILL\s*IN|TODO|TBD|PLACEHOLDER)[^\]]*\]/i;

function parseMode(args) {
  const accepted = new Set(["--fix-stub", "--stubs-only"]);
  const unknown = args.filter((arg) => !accepted.has(arg));
  if (unknown.length) {
    throw new Error(`Unknown option: ${unknown.join(", ")}`);
  }
  if (new Set(args).size !== args.length || args.length > 1) {
    throw new Error("Choose at most one mode: --fix-stub or --stubs-only.");
  }
  return args[0] === "--fix-stub"
    ? "fix-stub"
    : args[0] === "--stubs-only"
      ? "stubs-only"
      : "strict";
}

function validateSelectedPlan() {
  if (!Object.hasOwn(process.env, "TASK_PLAN_FILE")) return null;
  const rawPath = process.env.TASK_PLAN_FILE;
  if (!rawPath) {
    throw new Error("TASK_PLAN_FILE is set but empty; provide an existing .md file.");
  }
  if (path.extname(rawPath) !== ".md") {
    throw new Error(`TASK_PLAN_FILE must name a Markdown file ending in .md: ${rawPath}`);
  }
  const selectedPath = path.resolve(process.cwd(), rawPath);
  let stats;
  try {
    stats = fs.statSync(selectedPath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      throw new Error(`TASK_PLAN_FILE does not exist: ${rawPath}`);
    }
    throw new Error(`Cannot access TASK_PLAN_FILE ${rawPath}: ${error.message}`);
  }
  if (!stats.isFile()) {
    throw new Error(`TASK_PLAN_FILE is not a file: ${rawPath}`);
  }
  return selectedPath;
}

function listPlanFiles(selectedPath) {
  if (selectedPath) return [selectedPath];
  if (!fs.existsSync(DEFAULT_PLAN_DIR)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && path.extname(entry.name) === ".md") files.push(entryPath);
    }
  };
  visit(DEFAULT_PLAN_DIR);
  return files.sort();
}

function extractPlanBody(content) {
  return content
    .replace(/^## (?:Regression Guard|Out of scope|Relevant files|Pre-existing failures to ignore|Validation)\s*\n[\s\S]*?(?=^## |\s*$)/gim, "\n");
}

function getTitle(content) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function isDeletePlan(title) {
  return /^DELETE(?:\b|[-_:])/i.test(title);
}

function isPureHardening(title, body) {
  const titleSignalsDeliverable =
    /^(?:add|build|create|implement|install|introduce|write|apply|verify|confirm|check)\s+(?:(?:the|a|an)\s+)?(?:(?:task[- ]plan|regression)\s+)*(?:guard(?:\s+script)?|checker|lint(?:er)?|tests?|validation(?:\s+check)?)\b/i.test(title);
  const declaredPrimaryDeliverable =
    /\b(?:primary|whole)\s+(?:deliverable|purpose)\b[\s\S]{0,100}\b(?:test|guard|checker|lint|check)\b/i.test(body);
  return titleSignalsDeliverable || declaredPrimaryDeliverable;
}

function isCosmeticErrorCopy(title, body) {
  const titleIsCopyEdit =
    /^(?:change|edit|polish|reword|rewrite|update)\b/i.test(title) &&
    /\b(?:error\s+(?:message|string|text)|copy|wording)\b/i.test(`${title}\n${body}`);
  const explicitlyCopyOnly =
    /\b(?:cosmetic|copy-only|wording-only|rewording-only)\b[\s\S]{0,80}\b(?:error|message|string)\b/i.test(body);
  const behaviorChanges = /\b(?:when it fires|whether it fires|trigger(?:s|ing)?|error handling|catch(?:es|ing)?|retry|recover(?:y|s|ing)?)\b/i.test(body);
  return (titleIsCopyEdit || explicitlyCopyOnly) && !behaviorChanges;
}

function isExplicitlyAdditive(title, body) {
  const addsNewCapability =
    /^(?:add|build|create|implement|introduce|offer|provide)\b/i.test(title) &&
    /\b(?:new|optional|independent)\s+(?:[\w-]+\s+){0,2}(?:endpoint|option|field|contract|panel|feature|capability)\b/i.test(body);
  const changesExistingBehavior =
    /\b(?:fix|replace|change|alter|modify|remove|migrate|break(?:ing)?|regression|wrong|incorrect|corrupt(?:ion)?)\b[\s\S]{0,80}\b(?:existing|prior|previous|old|current)\b|\b(?:existing|prior|previous|old|current)\b[\s\S]{0,80}\b(?:behavior|contract|flow|data|boundary|feature)\b/i.test(body);
  const explicitlyNoReplacement =
    /\b(?:without|does not|doesn't|does not replace|doesn't replace)\b[\s\S]{0,80}\b(?:changing|change|replacing|replace|altering|alter)\b[\s\S]{0,80}\b(?:existing|prior|previous)\b/i.test(body);
  return addsNewCapability && (!changesExistingBehavior || explicitlyNoReplacement);
}

function classifyPlan(content) {
  const title = getTitle(content);
  const body = extractPlanBody(content);
  if (isDeletePlan(title)) return { qualifies: false, reason: "DELETE-prefixed plan" };
  if (isPureHardening(title, body)) return { qualifies: false, reason: "self-satisfying hardening task" };
  if (/\b(?:purely additive|pure-hardening|genuinely non-material|non-material internal refactor)\b/i.test(body)) {
    return { qualifies: false, reason: "explicitly excluded scope" };
  }
  if (isExplicitlyAdditive(title, body)) return { qualifies: false, reason: "purely additive feature" };
  if (isCosmeticErrorCopy(title, body)) return { qualifies: false, reason: "cosmetic error-copy change" };

  const strongSignals = [
    /\b(?:fix|bug[- ]fix|broken|wrong|incorrect|regression|crash|silently|stale|doesn['’]t work|fails? to|should have but didn['’]t)\b/i,
    /\b(?:prevent .{0,80} from happening again|no longer .{0,80})\b/i,
    /\b(?:auth(?:entication|orization)?|permissions?|access control|tenant isolation|personal data|PII|secret|redact(?:ed|ing|ion)?|exposure|disclosure|retention|privacy|encryption|CORS)\b/i,
    /\b(?:data loss|corruption|duplicate|wrong record|stale overwrite|integrity|validation|migration|schema|idempotency|atomic(?:ity)?|consistency|reconciliation)\b/i,
    /\b(?:race|deadlock|lock(?:ing)?|concurren(?:t|cy)|cancellation|abort|cleanup|dispos(?:e|al)|shutdown|worker|queue|lifecycle|double-run|stranded)\b/i,
    /\b(?:timeout|latency|slow|memory|CPU|OOM|leak|backpressure|throughput|availability|degraded|flaky|retry|cache|capacity)\b/i,
    /\b(?:breaking|backwards compatibility|API|wire format|serialization|public type|supported client|config(?:uration)?|storage format|version|existing contract|contract break)\b/i,
    /\b(?:try\s*\/\s*catch|error boundary|error handling|error-response shape|fallback branch|retry logic|timeout logic|validation reject)\b/i,
    /\b(?:replace(?:s|d|ing)? prior behavior|change(?:s|d|ing)? existing behavior|alter(?:s|ed|ing)? existing behavior|different default|redirected flow|changes? what an existing feature does)\b/i,
  ];
  return strongSignals.some((pattern) => pattern.test(body))
    ? { qualifies: true, reason: "material-change signal found" }
    : { qualifies: false, reason: "no qualifying material-change signal found" };
}

function findSections(content) {
  const matches = [...content.matchAll(GUARD_HEADING)];
  return matches.map((match) => {
    const start = match.index;
    const afterHeading = start + match[0].length;
    const nextHeading = content.slice(afterHeading).search(/^##\s+/m);
    const end = nextHeading < 0 ? content.length : afterHeading + nextHeading;
    return { start, end, text: content.slice(afterHeading, end) };
  });
}

function fieldValues(sectionText, label) {
  const expression = new RegExp(`^\\*\\*${label}:\\*\\*[\\t ]*(.*)$`, "gm");
  return [...sectionText.matchAll(expression)].map((match) => match[1].trim());
}

function declarationLines(sectionText, label) {
  const expression = new RegExp(`^\\*\\*${label}\\*\\*[\\t ]*(.*)$`, "gm");
  return [...sectionText.matchAll(expression)].map((match) => match[1].trim());
}

function isPlaceholder(value) {
  return !value || PLACEHOLDER.test(value);
}

function hasValidNaReason(reason) {
  const concreteLength = reason.replace(/[*_`]/g, "").trim().length >= 35;
  const validCategory =
    /\b(?:race condition|race)\b[\s\S]{0,100}\b(?:real[- ]clock|wall[- ]clock|timing|concurrency)\b/i.test(reason) ||
    /\b(?:unmockable|live|third[- ]party|external)\b[\s\S]{0,100}\b(?:API|service|endpoint|behavior)\b/i.test(reason) ||
    (/\b(?:purely visual|visual regression|pixel[- ]diff|screenshot)\b[\s\S]{0,160}\b(?:no|without|lacks?|does not have|has no|unavailable|not available)\b[\s\S]{0,80}\b(?:screenshot|pixel[- ]diff|visual)\b/i.test(reason) ||
      /\b(?:no|without|lacks?|does not have|has no|unavailable|not available)\b[\s\S]{0,80}\b(?:screenshot|pixel[- ]diff|visual)\b[\s\S]{0,160}\b(?:purely visual|visual regression|pixel[- ]diff)\b/i.test(reason)) ||
    /\b(?:fix|change|task)\b[\s\S]{0,80}\b(?:removes?|deletes?|eliminates?)\b[\s\S]{0,80}\b(?:feature|behavior|code path)\b/i.test(reason) ||
    /\b(?:feature|behavior|code path)\b[\s\S]{0,100}\b(?:removed|delet(?:ed|ion)|gone|eliminated)\b/i.test(reason);
  return concreteLength && validCategory && !PLACEHOLDER.test(reason);
}

function checkSection(section, planPath, sectionIndex, mode, classification) {
  const problems = [];
  if (sectionIndex > 0) problems.push("contains more than one ## Regression Guard section");
  const text = section.text.trim();
  const naLines = declarationLines(text, "N/A");
  const selfLines = declarationLines(text, "Self-satisfying");
  const normalFields = ["Covers", "Test location", "What it checks"];
  const presentNormal = normalFields.some((label) => fieldValues(text, label).length > 0);
  const labeledFields = [...text.matchAll(/^\*\*([^*]+):\*\*/gm)]
    .map((match) => match[1].trim());

  const placeholderProblems = [];
  const structuralProblems = [];
  const problem = (message, placeholder = false) =>
    (placeholder ? placeholderProblems : structuralProblems).push(message);

  if (PLACEHOLDER.test(text)) {
    problem("section contains an unfilled placeholder", true);
  }

  if (naLines.length) {
    if (naLines.length !== 1 || selfLines.length || presentNormal) {
      problem("N/A declaration must be the only declaration in its section");
    }
    if (labeledFields.some((label) => label !== "Why N/A")) {
      problem("N/A section contains an unexpected field");
    }
    const why = fieldValues(text, "Why N/A");
    if (why.length === 0) {
      problem("requires exactly one **Why N/A:** field", true);
    } else if (why.length > 1) {
      problem("requires exactly one **Why N/A:** field");
    } else if (isPlaceholder(why[0])) {
      problem("**Why N/A:** contains an unfilled placeholder", true);
    } else if (!hasValidNaReason(why[0])) {
      problem("**Why N/A:** does not state a specific reason from the allowed N/A cases");
    }
    if (naLines[0] !== "" || PLACEHOLDER.test(naLines[0] ?? "")) {
      problem("N/A declaration is incomplete or contains a placeholder", true);
    }
  } else if (selfLines.length) {
    if (selfLines.length !== 1 || presentNormal) {
      problem("Self-satisfying declaration must be the only declaration in its section");
    }
    if (labeledFields.length) problem("Self-satisfying section must not contain field labels");
    const declaration = selfLines[0] ?? "";
    if (isPlaceholder(declaration) || declaration.length < 20) {
      problem("Self-satisfying declaration needs a concrete deliverable", true);
    } else if (!/\b(?:test|guard|checker|script|lint|check)\b/i.test(declaration)) {
      problem("Self-satisfying declaration must identify the test or guard deliverable");
    }
    if (
      mode === "strict" &&
      classification?.reason !== "self-satisfying hardening task"
    ) {
      problem("Self-satisfying is valid only when the primary deliverable is itself a test or guard");
    }
  } else {
    for (const label of normalFields) {
      const values = fieldValues(text, label);
      if (values.length === 0) {
        problem(`requires exactly one **${label}:** field`, true);
      } else if (values.length > 1) {
        problem(`requires exactly one **${label}:** field`);
        if (values.some(isPlaceholder)) {
          problem(`**${label}:** contains an unfilled placeholder`, true);
        }
      } else if (isPlaceholder(values[0])) {
        problem(`**${label}:** is empty or contains an unfilled placeholder`, true);
      }
    }
    const knownLabels = new Set(normalFields);
    const unexpectedFields = labeledFields.filter((label) => !knownLabels.has(label));
    if (unexpectedFields.length) {
      problem(`contains unexpected field${unexpectedFields.length === 1 ? "" : "s"}: ${unexpectedFields.join(", ")}`);
    }
    const declarationLabels = [...text.matchAll(/^\*\*(?:N\/A|Self-satisfying)\*\*/gim)];
    if (declarationLabels.length) problem("declaration mixes normal fields with another declaration");
  }

  if (!naLines.length && !selfLines.length) {
    const strayFields = [...text.matchAll(/^\*\*(?:Why N\/A|N\/A)\b/gim)];
    if (strayFields.length) problem("N/A fields require a **N/A** declaration");
  }

  if (mode === "stubs-only") {
    for (const message of placeholderProblems) problems.push(message);
    return problems.map((message) => `${planPath}: ${message}`);
  }
  problems.push(...structuralProblems, ...placeholderProblems);
  return problems.map((message) => `${planPath}: ${message}`);
}

function checkPlacement(content, section, planPath) {
  const headingMatches = [...content.matchAll(/^## (.+?)\s*$/gm)];
  const indexOfHeading = (name) =>
    headingMatches.find((heading) => heading[1].trim().toLowerCase() === name)?.index ?? -1;
  const relevant = indexOfHeading("relevant files");
  const validation = indexOfHeading("validation");
  const preexisting = indexOfHeading("pre-existing failures to ignore");
  const problems = [];
  if (validation >= 0 && section.start < validation) {
    problems.push(`${planPath}: ## Regression Guard must follow ## Validation`);
  }
  if (preexisting >= 0 && section.start < preexisting) {
    problems.push(`${planPath}: ## Regression Guard must follow ## Pre-existing failures to ignore`);
  }
  if (relevant >= 0 && section.start > relevant) {
    problems.push(`${planPath}: ## Regression Guard must precede ## Relevant files`);
  }
  return problems;
}

function insertStub(content) {
  const stub = [
    "## Regression Guard",
    "**Covers:** <FILL IN: concrete scenario, boundary, invariant, lifecycle, reliability property, or contract>",
    "**Test location:** <FILL IN: test file path>",
    "**What it checks:** <FILL IN: specific assertion that catches recurrence>",
    "",
  ].join("\n");
  const headingMatches = [...content.matchAll(/^## (.+?)\s*$/gm)];
  const relevant = headingMatches.find((heading) => heading[1].trim().toLowerCase() === "relevant files");
  let insertionIndex;
  if (relevant) {
    insertionIndex = relevant.index;
  } else {
    const priorSectionNames = new Set(["validation", "pre-existing failures to ignore"]);
    const priorSections = headingMatches.filter((heading) =>
      priorSectionNames.has(heading[1].trim().toLowerCase()));
    if (priorSections.length) {
      const last = priorSections.reduce((a, b) => (a.index > b.index ? a : b));
      const nextHeading = headingMatches.find((heading) => heading.index > last.index);
      insertionIndex = nextHeading?.index ?? content.length;
    } else {
      insertionIndex = content.length;
    }
  }
  const before = content.slice(0, insertionIndex).replace(/\s*$/, "");
  const after = content.slice(insertionIndex).replace(/^\s*/, "");
  return `${before}\n\n${stub}${after ? `\n${after}` : ""}\n`;
}

function readPlans(files) {
  return files.map((file) => ({ file, content: fs.readFileSync(file, "utf8") }));
}

function strictCheck(plans) {
  const violations = [];
  for (const plan of plans) {
    const sections = findSections(plan.content);
    const classification = classifyPlan(plan.content);
    if (!sections.length) {
      if (classification.qualifies) {
        violations.push(`${plan.file}: qualifying plan is missing ## Regression Guard`);
      }
      continue;
    }
    for (const [index, section] of sections.entries()) {
      violations.push(...checkSection(section, plan.file, index, "strict", classification));
      violations.push(...checkPlacement(plan.content, section, plan.file));
    }
  }
  return violations;
}

function stubsOnlyCheck(plans) {
  const violations = [];
  for (const plan of plans) {
    for (const [index, section] of findSections(plan.content).entries()) {
      violations.push(...checkSection(section, plan.file, index, "stubs-only"));
    }
  }
  return violations;
}

function printViolations(violations) {
  for (const violation of violations) console.error(`- ${violation}`);
}

function main() {
  let mode;
  let selectedPath;
  try {
    mode = parseMode(process.argv.slice(2));
    // Validate the single-file target before enumerating, reading, or writing plans.
    selectedPath = validateSelectedPlan();
  } catch (error) {
    console.error(`Regression Guard checker: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  let files;
  try {
    files = listPlanFiles(selectedPath);
  } catch (error) {
    console.error(`Regression Guard checker: cannot list task plans: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (!files.length) {
    console.log(`Regression Guard checker: no Markdown task plans found in ${DEFAULT_PLAN_DIR}.`);
    return;
  }

  let plans;
  try {
    plans = readPlans(files);
  } catch (error) {
    console.error(`Regression Guard checker: cannot read task plan: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (mode === "fix-stub") {
    let inserted = 0;
    try {
      for (const plan of plans) {
        if (!findSections(plan.content).length && classifyPlan(plan.content).qualifies) {
          fs.writeFileSync(plan.file, insertStub(plan.content), "utf8");
          inserted += 1;
        }
      }
    } catch (error) {
      console.error(`Regression Guard checker: cannot write task plan: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Regression Guard checker: inserted ${inserted} stub${inserted === 1 ? "" : "s"}.`);
    return;
  }

  const violations = mode === "stubs-only"
    ? stubsOnlyCheck(plans)
    : strictCheck(plans);
  if (violations.length) {
    printViolations(violations);
    console.error(`Regression Guard checker: ${violations.length} issue${violations.length === 1 ? "" : "s"} found.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Regression Guard checker: ${mode} check passed (${plans.length} plan${plans.length === 1 ? "" : "s"}).`);
}

main();
