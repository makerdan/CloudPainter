#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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

export function validateSelectedPlan() {
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

function maskMarkdownExamples(content) {
  let fence = null;
  let inBlockquote = false;
  return content
    .split(/(?<=\n)/)
    .map((line) => {
      const lineContent = line.replace(/[\r\n]+$/, "");
      const mask = () => line.replace(/[^\r\n]/g, " ");

      if (fence) {
        const closing = new RegExp(`^ {0,3}${fence.character}{${fence.length},}[\\t ]*$`);
        if (closing.test(lineContent)) fence = null;
        return mask();
      }

      if (/^ {0,3}>/.test(lineContent)) {
        inBlockquote = true;
        return mask();
      }
      if (inBlockquote) {
        if (lineContent.trim()) return mask();
        inBlockquote = false;
      }

      const opening = lineContent.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (!opening) return line;
      if (opening[1][0] === "`" && opening[2].includes("`")) return line;
      fence = { character: opening[1][0], length: opening[1].length };
      return mask();
    })
    .join("");
}

function secondLevelHeadings(content) {
  const activeContent = maskMarkdownExamples(content);
  return [...activeContent.matchAll(/^## (.+?)\s*$/gm)].map((match) => ({
    index: match.index,
    name: match[1].trim().toLowerCase(),
  }));
}

function extractPlanBody(content) {
  const activeContent = maskMarkdownExamples(content);
  const ignoredSections = new Set([
    "regression guard",
    "regression assessment",
    "out of scope",
    "relevant files",
    "pre-existing failures to ignore",
    "validation",
  ]);
  const headings = secondLevelHeadings(activeContent);
  const ranges = headings.flatMap((heading, index) => {
    if (!ignoredSections.has(heading.name)) return [];
    return [{
      start: heading.index,
      end: headings[index + 1]?.index ?? activeContent.length,
    }];
  });

  if (!ranges.length) return activeContent;
  let result = "";
  let cursor = 0;
  for (const range of ranges) {
    result += activeContent.slice(cursor, range.start);
    result += activeContent.slice(range.start, range.end).replace(/[^\r\n]/g, " ");
    cursor = range.end;
  }
  return result + activeContent.slice(cursor);
}

function getTitle(content) {
  return maskMarkdownExamples(content).match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
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
  // Real mutations and observable malfunction clauses are evaluated separately;
  // "without changing when it fires" must not itself negate a copy-only scope.
  return titleIsCopyEdit || explicitlyCopyOnly;
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

// Deliberately bounded heuristics, not semantic proof. Exclusions are scoped to
// their own clauses; a title or an unrelated "unchanged" sentence cannot waive
// an explicit material mutation elsewhere in the plan.
function hasMaterialMutation(title, body) {
  return `${title}\n${body}`.split(/\n|[.!;]|\bbut\b|\balso\b/i).some(clause => {
    if (/^\s*(?:[-*\d.)]+\s*)?(?:without|no|not|never|does not|do not|cannot|unchanged)\b/i.test(clause)) return false;
    const active = clause.replace(/\b(?:without|does not|do not|no)\s+(?:changing|change|replacing|replace|altering|alter)\b.*$/i, "");
    if (/\b(?:change|edit|polish|reword|rewrite|update)\s+(?:the\s+)?error\s+(?:message|string|text)\b/i.test(active) &&
        !/\b(?:retry|retries|trigger|catch|recover|boundary|when|whether)\b/i.test(active) &&
        !/\b(?:and|then)\s+(?:fix|change|replace|alter|repair|modify)\b/i.test(active)) return false;
    if (/\b(?:copy-only|wording-only|cosmetic|reword|wording)\b/i.test(active) &&
        !/\b(?:and|then)\s+(?:fix|change|replace|alter|repair|modify)\b/i.test(active)) return false;
    // Test descriptions can name the failure they exercise without changing it.
    if (/^\s*(?:[-*\d.)]+\s*)?(?:add|write|verify|assert|test|exercise|cover)\b[^,]*\b(?:tests?|fixtures?|assertions?|coverage)\b/i.test(active) &&
        !/\b(?:and|then)\s+(?:fix|change|replace|alter|repair|modify)\b/i.test(active)) return false;
    return /\b(?:fix(?:es|ed|ing)?|repair\w*|correct\w*|replac\w*|chang\w*|alter\w*|modif\w*|migrat\w*|remov\w*|prevent\w*|reject\w*|restor\w*|retr(?:y|ies|ied)|cancel\w*|releas\w*|persist\w*)\b.{0,180}\b(?:auth(?:orization|entication)?|permission|access|tenant|privacy|retention|secret|boundary|persist|data|record|validation|schema|atomic|idempotenc|lock|queue|worker|lifecycle|cleanup|cache|timeout|retry|memory|availability|contract|API|wire format|serializ|default|behavior|flow|error|failure|bug|crash|wrong|incorrect|stale|layer|sketch|export)\w*/i.test(active);
  });
}

// Project only explicitly descriptive content and ordinary use of the gate's
// existing procedures. This is not a file-type exemption: a directive to change
// supported policy/behavior (even inside an instructional file) remains active.
function requestedScope(body) {
  const unresolvedDescriptions = [];
  const projected = body.split(/(?<=\n)|(?<=[.!;])(?=[\t ])/).map(clause => {
    const plain = clause.trim().replace(/^\*\*[^*\n]+\*\*[\t ]*—[\t ]*/, "")
      .replace(/[`*]/g, "").replace(/^\s*(?:[-\d.)]+\s*)?/, "").trim();
    const changesRules = /\b(?:to|and|then|also|must|will|that|which)\s+(?:\w+\s+){0,3}(?:waiv\w*|permit\w*|allow\w*|den\w*|remov\w*|chang\w*|alter\w*|replac\w*|bypass\w*|weaken\w*|requir(?:e|es|ed|ing)|enabl\w*|fix\w*|repair\w*)\b|\b(?:new|changed|different|revised)\s+(?:rules?|policy|workflow|defaults?|permissions?|requirements?|approval|authorization)\b/i;
    const description = /^(?:the|this)\s+(?:file|definition|document|revision)\s+(?:explicitly\s+)?(?:retains?|describes?|documents?|lists?|includes?|distinguishes?|explains?)\b/i.test(plain);
    if (description) {
      // Positive structural vocabulary, not a blacklist of dangerous verbs.
      // Unknown prose is never erased just because it describes a definition.
      // In particular, instructions/how/to/modal clauses and arbitrary actions
      // are not established as neutral by an owner-approved-copy label.
      const topics = new Set(("identity existing current unchanged all the a an and or of with without separate " +
        "help admin analytics runtime safety combined requirements tier coverage amendment subsection section guidance " +
        "canonical port authority heavy companion prerequisite definition installation gate maintenance application " +
        "admission assigned validation activation boundaries modes references includes").split(" "));
      const nouns = plain.replace(/^(?:the|this)\s+(?:file|definition|document|revision)\s+(?:explicitly\s+)?(?:retains?|describes?|documents?|lists?|includes?|distinguishes?|explains?)\s+/i, "")
        .replace(/^(?:the\s+)?[A-Z][\w-]*(?:\s+[A-Z][\w-]*)*\s+identity\b/, "identity")
        .replace(/\bnew\s+(?=(?:existing-tier\s+)?(?:coverage\/amendment\s+)?(?:subsection|section|table|heading)\b)/gi, "")
        .replace(/,\s+and does not grant implicit workload, listener-takeover, live-restart or deployment permission[.]?$/i, "");
      const neutral = !changesRules.test(plain) &&
        nouns.split(/[\s,./-]+/).filter(Boolean).every(word => topics.has(word.toLowerCase()));
      if (!neutral) unresolvedDescriptions.push(plain);
      return neutral ? clause.replace(/[^\r\n]/g, " ") : clause;
    }
    if (changesRules.test(plain)) return clause;
    const inspection = /^(?:recheck|inspect|read|compare|reverify|establish|verify)\b/i.test(plain) &&
      !/\b(?:chang\w*|alter(?:s|ed|ing)?|replac\w*|remov\w*|waiv\w*|permit\w*|bypass\w*|repair\w*|fix\w*)\b/i.test(plain);
    const procedure = /^(?:reconcile the exact sealed payload|use normal provisioning|use supported amendments for covered changes|run the full admitted tier|then run the full admitted tier|publish the definition handoff|if the canonical file has changed, preserve it and reconcile)\b/i.test(plain);
    const existingProcedureWords = new Set(("recheck inspect read compare reverify establish verify adopted owner instruction " +
      "current existing all task eligibility canonical governing sources baseline catalog actual workload archive identity crc unique safe " +
      "regular member paths manifest listed bytes definition approved exact delivered source parity preservation independently " +
      "pinned target using reproducible byte content assertions record observations limitations " +
      "bound tier result then run full admitted through its supported supervised route reconcile sealed payload into this native " +
      "it back satisfy preflight approval before edits use normal provisioning specification for exactly one adequate " +
      "amendments covered changes never hand edit seals records publish handoff pre identities checks authorization limits " +
      "explicit separation from subsequent runtime application lifecycle if file has changed preserve differences replacement instead " +
      "overwriting newer instructions silently adopting another the a and or of with to").split(" "));
    // Existing procedure prefixes alone are not exemptions either. Unknown
    // operations stay visible to material/risk checks rather than being hidden
    // inside an apparently harmless inspection or provisioning sentence.
    const neutralProcedure = (inspection || procedure) &&
      plain.split(/[\s,./;:-]+/).filter(Boolean).every(word => existingProcedureWords.has(word.toLowerCase()));
    if (neutralProcedure) return clause.replace(/[^\r\n]/g, " ");
    if (inspection || procedure) unresolvedDescriptions.push(plain);
    // "alternate" is not the verb "alter"; keep historical classification intact.
    return clause.replace(/\balternate\b/gi, "other");
  }).join("");
  return { body: projected, unresolvedDescriptions };
}

function classifyPlan(content, current = false) {
  const title = getTitle(content);
  const extracted = extractPlanBody(content);
  const projected = current ? requestedScope(extracted) : null;
  const body = projected?.body ?? extracted;
  if (projected?.unresolvedDescriptions.length) {
    return { qualifies: true, reason: "instructional description or procedure is not established as neutral; material coverage assessment required" };
  }
  if (!current && isDeletePlan(title)) return { qualifies: false, reason: "DELETE-prefixed plan" };
  if (current && /\b(?:this )?task is marked for deletion\b/i.test(body) &&
      !/\b(?:implement|execute|change|remove|repair|fix)\b/i.test(body.replace(/\bthis task is marked for deletion\b/ig, ""))) {
    return { qualifies: false, reason: "non-executing deletion-marked task" };
  }
  if (hasMaterialMutation(title, body)) return { qualifies: true, reason: "material-change signal found" };
  if (current && /\b(?:change|alter|replace|remove|waive|bypass)\w*\b[^.!;\n]{0,180}\b(?:supported workflow|existing workflow|policy|rules?|prerequisites?)\b/i.test(body)) {
    return { qualifies: true, reason: "material instructional policy/workflow change" };
  }
  if (current && body.split(/\n|[.!;]/).some(clause =>
    !/^\s*(?:[-*\d.)]+\s*)?(?:no|not|without|never|unchanged|does not)\b/i.test(clause) &&
    /\b(?:change|alter|replace|remove|reject|permit|repair|fix|deny|admit)\w*\b.{0,180}\b(?:admission|execution|publication|dispatch|authorization|workload|binding)\b/i.test(clause))) {
    return { qualifies: true, reason: "material admission/execution change" };
  }
  if (current && /\b(?:entire|whole|only|verification-only|test-only)\b.{0,100}\b(?:test|check|verif)/i.test(body) &&
      /\bunchanged behavior\b|\bno (?:separate )?material (?:behavior )?change\b/i.test(body)) {
    return { qualifies: false, reason: "self-satisfying hardening task" };
  }
  let exclusion = null;
  if (current && /\b(?:add|write|verify)\b[^\n.!;]*\btests?\b[^\n.!;]*\bwithout changing existing behavior\b/i.test(body)) {
    exclusion = "self-satisfying hardening task";
  }
  if (isPureHardening(title, body)) exclusion = "self-satisfying hardening task";
  if (body.split(/\n|[.!;]/).some(clause =>
    !/\b(?:not|never|isn't|is not|no longer)\b/i.test(clause) &&
    /\b(?:purely additive|pure-hardening|genuinely non-material|non-material internal refactor)\b/i.test(clause))) {
    exclusion ??= "explicitly excluded scope";
  }
  if (isExplicitlyAdditive(title, body)) exclusion ??= "purely additive feature";
  if (isCosmeticErrorCopy(title, body)) exclusion ??= "cosmetic error-copy change";

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
  const semanticRiskSignals = [
    /\b(?:misalign(?:s|ed|ment)?|drift(?:s|ed)? apart|out of alignment|wrong scale)\b/i,
    /\b(?:instead of|rather than)\b[\s\S]{0,100}\b(?:click|tap|select|open|close|save|rename|export|import|load)\b|\b(?:click|tap|select|open|close|save|rename|export|import|load)\b[\s\S]{0,100}\b(?:instead of|rather than)\b/i,
    /\b(?:stuck|unresponsive|stops responding|never finishes|spins forever|remains? .{0,50} forever)\b/i,
    /\b(?:one|another|different)\s+(?:account|profile|user)\b[\s\S]{0,120}\b(?:see|show|display|open|read)\b[\s\S]{0,120}\b(?:other|another|different|earlier|previous)\s+(?:account|profile|user)\b/i,
    /\b(?:earlier|first|older|previous)\s+(?:name|label|value|version|edit)\b[\s\S]{0,120}\b(?:saved|stored|wins|replaces|appears)\b/i,
    /\b(?:closing|closed|leaving|removed|unmounted)\b[\s\S]{0,120}\b(?:still running|left behind|remains|continues|holds)\b/i,
    /\b(?:unresponsive|cannot accept input|stops responding|takes minutes to)\b/i,
    /\b(?:older|earlier|previously saved)\s+(?:sketch(?:es)?|files?|records?|documents?)\b[\s\S]{0,120}\b(?:cannot|won't|will not|stop opening|stop loading|refuse to open)\b/i,
  ];
  const activeRisk = body.split(/\n|[.!;]/).filter(clause =>
    !/^\s*(?:[-*\d.)]+\s*)?(?:add|write|assert|verify|test|cover)\b.*\b(?:tests?|fixtures?|assertions?)\b/i.test(clause)).join("\n");
  if (semanticRiskSignals.some(pattern => pattern.test(activeRisk))) {
    return { qualifies: true, reason: "material-change signal found" };
  }
  if (exclusion) return { qualifies: false, reason: exclusion };
  return strongSignals.some((pattern) => pattern.test(body))
    ? { qualifies: true, reason: "material-change signal found" }
    : { qualifies: false, reason: "no qualifying material-change signal found" };
}

export const currentClassification = content => classifyPlan(content, true);

function findSections(content) {
  const activeContent = maskMarkdownExamples(content);
  const matches = [...activeContent.matchAll(GUARD_HEADING)];
  return matches.map((match) => {
    const start = match.index;
    const afterHeading = start + match[0].length;
    const nextHeading = activeContent.slice(afterHeading).search(/^##\s+/m);
    const end = nextHeading < 0 ? activeContent.length : afterHeading + nextHeading;
    return { start, end, text: activeContent.slice(afterHeading, end) };
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

function activeDeclarationText(sectionText) {
  let fence = null;
  let inBlockquote = false;
  return sectionText
    .split("\n")
    .filter((line) => {
      if (fence) {
        const closing = new RegExp(`^ {0,3}${fence.character}{${fence.length},}[\\t ]*$`);
        if (closing.test(line)) fence = null;
        return false;
      }

      if (/^ {0,3}>/.test(line)) {
        inBlockquote = true;
        return false;
      }
      if (inBlockquote) {
        if (!line.trim()) inBlockquote = false;
        else return false;
      }

      const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (!opening) return true;
      if (opening[1][0] === "`" && opening[2].includes("`")) return true;
      fence = { character: opening[1][0], length: opening[1].length };
      return false;
    })
    .join("\n");
}

function isPlaceholder(value) {
  return !value || PLACEHOLDER.test(value);
}

function hasValidNaReason(reason) {
  const concreteLength = reason.replace(/[*_`]/g, "").trim().length >= 35;
  const validCategory =
    (/\b(?:race condition|race)\b[\s\S]{0,100}\b(?:real[- ]clock|wall[- ]clock|timing|concurrency)\b/i.test(reason) &&
      /\b(?:cannot|can't|no deterministic|unreproducible)\b/i.test(reason)) ||
    (/\b(?:unmockable|live|third[- ]party|external)\b[\s\S]{0,100}\b(?:API|service|endpoint|behavior)\b/i.test(reason) &&
      /\b(?:unmockable|cannot|can't|not faithfully)\b/i.test(reason)) ||
    (/\b(?:purely visual|visual regression|pixel[- ]diff|screenshot)\b[\s\S]{0,160}\b(?:no|without|lacks?|does not have|has no|unavailable|not available)\b[\s\S]{0,80}\b(?:screenshot|pixel[- ]diff|visual)\b/i.test(reason) ||
      /\b(?:no|without|lacks?|does not have|has no|unavailable|not available)\b[\s\S]{0,80}\b(?:screenshot|pixel[- ]diff|visual)\b[\s\S]{0,160}\b(?:purely visual|visual regression|pixel[- ]diff)\b/i.test(reason)) ||
    /\b(?:fix|change|task)\b[\s\S]{0,80}\b(?:removes?|deletes?|eliminates?)\b[\s\S]{0,80}\b(?:feature|behavior|code path)\b/i.test(reason) ||
    /\b(?:feature|behavior|code path)\b[\s\S]{0,100}\b(?:removed|delet(?:ed|ion)|gone|eliminated)\b/i.test(reason);
  return concreteLength && validCategory && !PLACEHOLDER.test(reason);
}

function checkSection(section, planPath, sectionIndex, mode, classification) {
  const problems = [];
  if (sectionIndex > 0 && mode === "strict") problems.push("contains more than one ## Regression Guard section");
  const text = activeDeclarationText(section.text).trim();
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
      } else if (mode === "strict") {
        if (label === "Test location" &&
            !/(?:[\w@.-]+\/)*[\w.-]+\.(?:[cm]?[jt]sx?|py|sh|rb|go|rs|java|cs)\b|^Deferred to task #\d+ \(accepted\) — .{20,}/.test(values[0])) {
          problem("**Test location:** must name a concrete test file or accepted task deferral");
        }
        if (label !== "Test location" && values[0].length < 25) {
          problem(`**${label}:** needs a specific scenario or assertion`);
        }
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
  const activeContent = maskMarkdownExamples(content);
  const headingMatches = [...activeContent.matchAll(/^## (.+?)\s*$/gm)];
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

function readPlans(files) {
  return files.map((file) => ({ file, content: fs.readFileSync(file, "utf8") }));
}

export function strictCheck(plans, { current = false } = {}) {
  const violations = [];
  for (const plan of plans) {
    const sections = findSections(plan.content);
    const classification = classifyPlan(plan.content, current);
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

export function main() {
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
    console.error("Regression Guard checker: --fix-stub is disabled; use supported draft creation or a supported amendment. No plans were changed.");
    process.exitCode = 1;
    return;
  }

  // A sealed plan's recorded contract, not whichever linter is newest, owns
  // admission. Never rescan siblings or normalize a historical seal.
  if (selectedPath && /^\*\*Unified task ID:\*\*/m.test(plans[0].content)) {
    const id = plans[0].content.match(/^\*\*Unified task ID:\*\* (.+)$/m)?.[1];
    const result = spawnSync(process.execPath, [path.join(SCRIPT_DIR, "check-failure-gate.mjs"), id], {
      cwd: PROJECT_ROOT, env: { ...process.env, TASK_PLAN_FILE: path.relative(PROJECT_ROOT, selectedPath) }, stdio: "inherit", timeout: 10000,
    });
    process.exitCode = result.status ?? 1;
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
