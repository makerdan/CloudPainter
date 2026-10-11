import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const CONFIRMATION_SKILL = path.join(
  PROJECT_ROOT,
  ".agents",
  "skills",
  "skill-install-confirmation",
  "SKILL.md",
);
const CONFIRMATION_GUIDANCE = fs.readFileSync(CONFIRMATION_SKILL, "utf8");

function fixture(t, files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "skill-confirmation-boundary-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const destination = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
  }
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function fixtureSkill(lines = Array.from({ length: 10 }, (_, index) => `Body line ${index + 1}`)) {
  return `---\nname: Fixture skill\n---\n${lines.join("\n")}\n`;
}

function skillBodyLines(contents) {
  const withoutFrontmatter = contents.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  return withoutFrontmatter.split(/\r?\n/).filter((line) => line.trim() !== "");
}

function changedNonblankLineCount(original, proposed) {
  const originalLines = skillBodyLines(original);
  const proposedLines = skillBodyLines(proposed);
  const sharedLineCount = Math.min(originalLines.length, proposedLines.length);
  let changedCount = Math.abs(originalLines.length - proposedLines.length);
  for (let index = 0; index < sharedLineCount; index += 1) {
    if (originalLines[index] !== proposedLines[index]) changedCount += 1;
  }
  return changedCount;
}

function assessRepair(original, proposed) {
  const totalBodyLines = skillBodyLines(original).length;
  const changedLines = changedNonblankLineCount(original, proposed);
  return {
    totalBodyLines,
    changedLines,
    exceedsLimit: changedLines > totalBodyLines / 2,
  };
}

function applyConfirmationEdits(root, designatedSkillPath, edits) {
  const allowedPath = path.resolve(root, designatedSkillPath);
  const unsupported = [];
  for (const [relativePath, contents] of Object.entries(edits)) {
    const destination = path.resolve(root, relativePath);
    if (destination !== allowedPath) {
      unsupported.push(relativePath);
      continue;
    }
    fs.writeFileSync(destination, contents);
  }
  return {
    unsupported,
    report: unsupported.map((file) =>
      `Unsupported confirmation edit blocked: ${file}; only ${designatedSkillPath} may be edited.`,
    ),
  };
}

function applyBoundedRepair(skillPath, original, proposed) {
  const assessment = assessRepair(original, proposed);
  if (assessment.exceedsLimit) {
    return {
      applied: false,
      ...assessment,
      report: `Rewrite limit reached: ${assessment.changedLines} of ${assessment.totalBodyLines} nonblank body lines would change, which is more than half. Stop and request a separate rewrite task.`,
    };
  }
  fs.writeFileSync(skillPath, proposed);
  return { applied: true, ...assessment, report: "" };
}

test("canonical confirmation guidance is file-only and bars broader code edits", () => {
  assert.match(CONFIRMATION_GUIDANCE, /confirm task is \*\*scoped to the skill file only\*\*/i);
  assert.match(
    CONFIRMATION_GUIDANCE,
    /does \*\*not\*\* touch the broader codebase, adjacent skills, or any artifact code/i,
  );
  assert.match(
    CONFIRMATION_GUIDANCE,
    /Make any changes outside `\.agents\/skills\/<name>\/SKILL\.md`/,
  );
});

test("attempted application and adjacent-skill edits are reported and left unchanged", (t) => {
  const originalSkill = fixtureSkill();
  const originalApp = "export const title = 'Original application';\n";
  const originalNeighbor = "name: Neighbor skill\n";
  const root = fixture(t, {
    ".agents/skills/example/SKILL.md": originalSkill,
    ".agents/skills/neighbor/SKILL.md": originalNeighbor,
    "artifacts/cloudpainter/src/App.tsx": originalApp,
  });
  const designatedSkillPath = ".agents/skills/example/SKILL.md";
  const changedSkill = originalSkill.replace("Body line 1", "Corrected body line 1");
  const result = applyConfirmationEdits(root, designatedSkillPath, {
    [designatedSkillPath]: changedSkill,
    "artifacts/cloudpainter/src/App.tsx": "export const title = 'Unauthorized change';\n",
    ".agents/skills/neighbor/SKILL.md": "name: Unauthorized neighboring edit\n",
  });

  assert.equal(fs.readFileSync(path.join(root, designatedSkillPath), "utf8"), changedSkill);
  assert.equal(
    fs.readFileSync(path.join(root, "artifacts/cloudpainter/src/App.tsx"), "utf8"),
    originalApp,
  );
  assert.equal(
    fs.readFileSync(path.join(root, ".agents/skills/neighbor/SKILL.md"), "utf8"),
    originalNeighbor,
  );
  assert.deepEqual(result.unsupported, [
    "artifacts/cloudpainter/src/App.tsx",
    ".agents/skills/neighbor/SKILL.md",
  ]);
  assert.match(result.report.join("\n"), /Unsupported confirmation edit blocked: artifacts\/cloudpainter\/src\/App\.tsx/);
  assert.match(result.report.join("\n"), /Unsupported confirmation edit blocked: \.agents\/skills\/neighbor\/SKILL\.md/);
});

test("a targeted correction below half the body lines can be applied", (t) => {
  const original = fixtureSkill();
  const proposed = fixtureSkill([
    "Corrected body line 1",
    "Corrected body line 2",
    "Corrected body line 3",
    "Corrected body line 4",
    ...Array.from({ length: 6 }, (_, index) => `Body line ${index + 5}`),
  ]);
  const root = fixture(t, { ".agents/skills/example/SKILL.md": original });
  const skillPath = path.join(root, ".agents/skills/example/SKILL.md");

  const result = applyBoundedRepair(skillPath, original, proposed);

  assert.equal(result.totalBodyLines, 10);
  assert.equal(result.changedLines, 4);
  assert.equal(result.exceedsLimit, false);
  assert.equal(result.applied, true);
  assert.equal(fs.readFileSync(skillPath, "utf8"), proposed);
});

test("a repair at exactly half the body lines does not cross the strict stop boundary", () => {
  const original = fixtureSkill();
  const proposed = fixtureSkill([
    "Corrected body line 1",
    "Corrected body line 2",
    "Corrected body line 3",
    "Corrected body line 4",
    "Corrected body line 5",
    "Body line 6",
    "Body line 7",
    "Body line 8",
    "Body line 9",
    "Body line 10",
  ]);

  const result = assessRepair(original, proposed);

  assert.equal(result.totalBodyLines, 10);
  assert.equal(result.changedLines, 5);
  assert.equal(result.exceedsLimit, false);
});

test("a repair over half the body lines reports the limit and preserves the fixture", (t) => {
  const original = fixtureSkill();
  const proposed = fixtureSkill([
    "Rewritten body line 1",
    "Rewritten body line 2",
    "Rewritten body line 3",
    "Rewritten body line 4",
    "Rewritten body line 5",
    "Rewritten body line 6",
    "Body line 7",
    "Body line 8",
    "Body line 9",
    "Body line 10",
  ]);
  const root = fixture(t, { ".agents/skills/example/SKILL.md": original });
  const skillPath = path.join(root, ".agents/skills/example/SKILL.md");

  const result = applyBoundedRepair(skillPath, original, proposed);

  assert.equal(result.totalBodyLines, 10);
  assert.equal(result.changedLines, 6);
  assert.equal(result.exceedsLimit, true);
  assert.equal(result.applied, false);
  assert.match(result.report, /6 of 10 nonblank body lines/);
  assert.match(result.report, /more than half/);
  assert.match(result.report, /separate rewrite task/);
  assert.equal(fs.readFileSync(skillPath, "utf8"), original);
});

test("canonical confirmation guidance defines the strict greater-than-half stop boundary", () => {
  assert.match(CONFIRMATION_GUIDANCE, /more than half of the nonblank body lines after the YAML front matter/i);
  assert.match(CONFIRMATION_GUIDANCE, /Count lines whose content would be deleted or whose meaning would materially change/);
  assert.match(CONFIRMATION_GUIDANCE, /Do not use this threshold to avoid ordinary targeted corrections/);
  assert.match(CONFIRMATION_GUIDANCE, /must \*\*stop\*\* instead of attempting a wholesale rewrite/i);
});
