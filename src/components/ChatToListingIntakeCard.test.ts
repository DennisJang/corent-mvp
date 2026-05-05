// Static-text guards for ChatToListingIntakeCard's leakage guard
// (post-2026-05-05 smoke). Ensures the submit + draft buttons are
// gated on a `probePending` state so a closed-alpha tester cannot
// click during the brief window between mount and the chat-intake
// mode probe resolving.
//
// Behavior is covered by the existing chat intake action / adapter
// suites; this file pins source-level invariants only.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(
  process.cwd(),
  "src",
  "components",
  "ChatToListingIntakeCard.tsx",
);
const SRC = readFileSync(FILE, "utf-8");

describe("ChatToListingIntakeCard — probe-pending leakage guard", () => {
  it("declares a probePending state initialized to true", () => {
    expect(SRC).toMatch(/const\s+\[probePending,\s*setProbePending\]\s*=\s*useState\(\s*true\s*\)/);
  });

  it("flips probePending to false inside the probe .then handler", () => {
    expect(SRC).toMatch(/setProbePending\(\s*false\s*\)/);
  });

  it("disables the 초안 미리보기 (preview) button while probePending is true", () => {
    // Find the preview-button JSX and confirm `probePending` is on
    // the disabled boolean.
    const previewMatch = SRC.match(
      /onClick=\{handleSubmit\}\s*disabled=\{[\s\S]*?\}\s*type="button"[\s\S]*?초안 미리보기/,
    );
    expect(previewMatch).not.toBeNull();
    expect(previewMatch![0]).toContain("probePending");
  });

  it("disables the 리스팅 초안으로 저장 (save draft) button while probePending is true", () => {
    const saveMatch = SRC.match(
      /onClick=\{handleCreateDraft\}\s*disabled=\{[\s\S]*?\}\s*type="button"[\s\S]*?리스팅 초안으로 저장/,
    );
    expect(saveMatch).not.toBeNull();
    expect(saveMatch![0]).toContain("probePending");
  });

  it("does NOT show 로컬 도우미 badge while probe is pending", () => {
    // The header badge ternary must branch on probePending FIRST
    // and emit a `베타 모드 확인 중` Badge in that branch — the
    // `로컬 도우미` Badge is permitted only inside the resolved
    // `mode === "local"` ternary leaf reached after the probe
    // settles. We assert the contiguous chain from
    // `probePending ?` straight into the `베타 모드 확인 중`
    // Badge with no other Badge tag in between.
    const headerOpen = SRC.indexOf("<header");
    const headerClose = SRC.indexOf("</header>");
    expect(headerOpen).toBeGreaterThan(0);
    expect(headerClose).toBeGreaterThan(headerOpen);
    const headerBlock = SRC.slice(headerOpen, headerClose);
    expect(headerBlock).toMatch(
      /probePending\s*\?\s*\(\s*<Badge[^>]*>\s*베타 모드 확인 중/,
    );
    // 로컬 도우미 must NOT be the first Badge inside the header.
    const firstLocal = headerBlock.indexOf("로컬 도우미");
    const firstPending = headerBlock.indexOf("베타 모드 확인 중");
    expect(firstPending).toBeGreaterThan(0);
    expect(firstLocal).toBeGreaterThan(firstPending);
  });

  it("shows a neutral 베타 모드 확인 중 caption during probe-pending", () => {
    expect(SRC).toContain("베타 모드 확인 중");
  });
});

describe("ChatToListingIntakeCard — design discipline", () => {
  it("does not introduce non-token color literals (only #000 / #fff allowed)", () => {
    const offenders: string[] = [];
    const COLOR_LITERAL =
      /(?:#(?:[0-9a-fA-F]{3,8})|rgba?\([^)]*\)|hsla?\([^)]*\))/g;
    const matches = SRC.match(COLOR_LITERAL) ?? [];
    for (const m of matches) {
      const lower = m.toLowerCase();
      if (lower === "#000" || lower === "#000000") continue;
      if (lower === "#fff" || lower === "#ffffff") continue;
      offenders.push(m);
    }
    expect(offenders).toEqual([]);
  });
});
