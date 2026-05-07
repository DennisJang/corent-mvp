// Tests for the BrandProfile primitive v1.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BRAND_CLAIM_POLICIES,
  BRAND_CTA_PRIORITIES,
  BRAND_CTA_STYLES,
  BRAND_ENERGIES,
  BRAND_FORMALITIES,
  BRAND_LANGUAGES,
  BRAND_MOTION_INTENSITIES,
  BRAND_PROFILE_SOURCES,
  BRAND_TONES,
  BRAND_TRUST_POSTURES,
  BRAND_VISUAL_DENSITIES,
  FORBIDDEN_PHRASE_SEVERITIES,
  PLATFORM_DEFAULT_BRAND_PROFILE,
  assertValidBrandProfile,
  createDefaultBrandProfile,
  getBlockedForbiddenPhrases,
  getBrandProfileSummary,
  getPrimaryCtas,
  isCanonicalMessageLocked,
  mergeBrandProfileDraft,
  validateBrandProfile,
  type BrandProfile,
  type CanonicalMessage,
} from "./brandProfile";

// ---------------------------------------------------------------
// Source-level invariants
// ---------------------------------------------------------------

const FILE = join(process.cwd(), "src", "lib", "cie", "brandProfile.ts");
const SRC = readFileSync(FILE, "utf-8");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const RUNTIME_SRC = stripComments(SRC);
const IMPORT_BLOB = (
  RUNTIME_SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

const CORENT_MARKETPLACE_TERMS: ReadonlyArray<string> = [
  "rental",
  "deposit",
  "seller store",
  "borrower",
  "return",
  "claim",
  "dispute",
  "logistics",
  "escrow",
  "insurance",
];

function buildValidProfile(
  overrides: Partial<BrandProfile> = {},
): BrandProfile {
  return createDefaultBrandProfile(overrides);
}

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

describe("BrandProfile — closed vocabularies", () => {
  it("BRAND_TONES lists the 8 expected values", () => {
    expect([...BRAND_TONES].sort()).toEqual(
      [
        "professional",
        "warm",
        "premium",
        "direct",
        "friendly",
        "calm",
        "technical",
        "playful",
      ].sort(),
    );
  });

  it("BRAND_FORMALITIES lists the 3 expected values", () => {
    expect([...BRAND_FORMALITIES].sort()).toEqual(
      ["casual", "balanced", "formal"].sort(),
    );
  });

  it("BRAND_ENERGIES lists the 3 expected values", () => {
    expect([...BRAND_ENERGIES].sort()).toEqual(
      ["quiet", "balanced", "expressive"].sort(),
    );
  });

  it("BRAND_TRUST_POSTURES lists the 3 expected values", () => {
    expect([...BRAND_TRUST_POSTURES].sort()).toEqual(
      [
        "low_risk_public",
        "careful_service",
        "high_trust_review_required",
      ].sort(),
    );
  });

  it("BRAND_VISUAL_DENSITIES lists the 3 expected values", () => {
    expect([...BRAND_VISUAL_DENSITIES].sort()).toEqual(
      ["sparse", "balanced", "dense"].sort(),
    );
  });

  it("BRAND_MOTION_INTENSITIES lists the 3 expected values", () => {
    expect([...BRAND_MOTION_INTENSITIES].sort()).toEqual(
      ["none", "subtle", "moderate"].sort(),
    );
  });

  it("BRAND_CTA_STYLES lists the 4 expected values", () => {
    expect([...BRAND_CTA_STYLES].sort()).toEqual(
      ["direct", "consultative", "educational", "exploratory"].sort(),
    );
  });

  it("BRAND_LANGUAGES lists the 3 expected values", () => {
    expect([...BRAND_LANGUAGES].sort()).toEqual(["ko", "en", "bilingual"].sort());
  });

  it("BRAND_CLAIM_POLICIES lists the 3 expected values", () => {
    expect([...BRAND_CLAIM_POLICIES].sort()).toEqual(
      [
        "strict_canonical_only",
        "allow_light_rewrite",
        "allow_marketing_variants",
      ].sort(),
    );
  });

  it("BRAND_PROFILE_SOURCES lists the 4 expected values", () => {
    expect([...BRAND_PROFILE_SOURCES].sort()).toEqual(
      ["manual", "imported_from_site", "generated_draft", "human_reviewed"].sort(),
    );
  });

  it("FORBIDDEN_PHRASE_SEVERITIES lists 'avoid' and 'block'", () => {
    expect([...FORBIDDEN_PHRASE_SEVERITIES].sort()).toEqual(
      ["avoid", "block"].sort(),
    );
  });

  it("BRAND_CTA_PRIORITIES lists primary/secondary/tertiary", () => {
    expect([...BRAND_CTA_PRIORITIES].sort()).toEqual(
      ["primary", "secondary", "tertiary"].sort(),
    );
  });
});

// ---------------------------------------------------------------
// Default platform profile validates
// ---------------------------------------------------------------

describe("PLATFORM_DEFAULT_BRAND_PROFILE", () => {
  it("validates ok:true", () => {
    expect(validateBrandProfile(PLATFORM_DEFAULT_BRAND_PROFILE).ok).toBe(true);
  });

  it("uses the platform-default identity values", () => {
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.id).toBe("platform_default");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.displayName).toBe("Platform");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.source).toBe("manual");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.language).toBe("bilingual");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.tone).toBe("calm");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.formality).toBe("balanced");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.energy).toBe("quiet");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.trustPosture).toBe("careful_service");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.visualDensity).toBe("sparse");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.motionIntensity).toBe("subtle");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.ctaStyle).toBe("consultative");
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.claimPolicy).toBe(
      "strict_canonical_only",
    );
  });

  it("ships at least one canonical message, all locked under strict_canonical_only", () => {
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.canonicalMessages.length).toBeGreaterThan(
      0,
    );
    for (const m of PLATFORM_DEFAULT_BRAND_PROFILE.canonicalMessages) {
      expect(m.locked).toBe(true);
      expect(m.maxRewritePolicy).toBe("strict_canonical_only");
    }
  });

  it("ships forbidden phrases / primary CTAs / safety notes", () => {
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.forbiddenPhrases.length).toBeGreaterThan(
      0,
    );
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.primaryCtas.length).toBeGreaterThan(0);
    expect(PLATFORM_DEFAULT_BRAND_PROFILE.safetyNotes.length).toBeGreaterThan(0);
  });
});

describe("createDefaultBrandProfile", () => {
  it("returns a profile that validates ok:true", () => {
    expect(validateBrandProfile(createDefaultBrandProfile()).ok).toBe(true);
  });

  it("applies overrides over the default scalar fields", () => {
    const profile = createDefaultBrandProfile({
      id: "custom_brand",
      displayName: "Custom",
      tone: "warm",
    });
    expect(profile.id).toBe("custom_brand");
    expect(profile.displayName).toBe("Custom");
    expect(profile.tone).toBe("warm");
    // Defaults remain when not overridden.
    expect(profile.formality).toBe("balanced");
    expect(profile.canonicalMessages.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------
// Closed-vocab drift detection
// ---------------------------------------------------------------

describe("validateBrandProfile — closed-vocab drift", () => {
  it("flags out-of-vocab tone / formality / energy / trust posture / density / motion / cta style / language / claim policy / source", () => {
    const profile = buildValidProfile({
      tone: "evil_tone" as never,
      formality: "evil_formal" as never,
      energy: "evil_energy" as never,
      trustPosture: "evil_trust" as never,
      visualDensity: "evil_density" as never,
      motionIntensity: "evil_motion" as never,
      ctaStyle: "evil_cta" as never,
      language: "xx" as never,
      claimPolicy: "evil_claim" as never,
      source: "evil_source" as never,
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /tone 'evil_tone'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /formality 'evil_formal'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /energy 'evil_energy'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /trustPosture 'evil_trust'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /visualDensity 'evil_density'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /motionIntensity 'evil_motion'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /ctaStyle 'evil_cta'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /language 'xx'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /claimPolicy 'evil_claim'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /source 'evil_source'/.test(e))).toBe(true);
  });

  it("flags an empty id / displayName", () => {
    const r = validateBrandProfile(buildValidProfile({ id: "", displayName: "" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /id: must be a non-empty string/.test(e))).toBe(true);
    expect(r.errors.some((e) => /displayName.*non-empty/.test(e))).toBe(true);
  });

  it("flags an out-of-vocab forbidden phrase severity", () => {
    const profile = buildValidProfile({
      forbiddenPhrases: [
        {
          phrase: "evil phrasing",
          reason: "not allowed",
          severity: "scream" as never,
        },
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /severity: 'scream'/.test(e))).toBe(true);
  });

  it("flags an out-of-vocab CTA priority", () => {
    const profile = buildValidProfile({
      primaryCtas: [
        {
          id: "x",
          label: "Click",
          actionHint: "Click here",
          priority: "ultra" as never,
        },
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /priority: 'ultra'/.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------
// Canonical-message rules
// ---------------------------------------------------------------

describe("validateBrandProfile — canonical messages", () => {
  it("flags a locked message with maxRewritePolicy 'allow_marketing_variants'", () => {
    const profile = buildValidProfile({
      canonicalMessages: [
        {
          id: "m1",
          label: "label",
          text: "We turn complex websites into purpose-driven interfaces.",
          locked: true,
          maxRewritePolicy: "allow_marketing_variants",
        },
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /locked canonical messages may not declare maxRewritePolicy 'allow_marketing_variants'/.test(
          e,
        ),
      ),
    ).toBe(true);
  });

  it("flags duplicate canonical message ids", () => {
    const dup: CanonicalMessage = {
      id: "shared_id",
      label: "label",
      text: "Plain calm message.",
      locked: false,
      maxRewritePolicy: "allow_light_rewrite",
    };
    const profile = buildValidProfile({
      canonicalMessages: [dup, { ...dup, text: "Another plain message." }],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /duplicate canonical message id 'shared_id'/.test(e)),
    ).toBe(true);
  });

  it("flags an empty canonical message text", () => {
    const profile = buildValidProfile({
      canonicalMessages: [
        {
          id: "m1",
          label: "label",
          text: "",
          locked: false,
          maxRewritePolicy: "allow_light_rewrite",
        },
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /canonicalMessages\[0\]\.text:.*non-empty/.test(e)),
    ).toBe(true);
  });

  it("flags a canonical message that exceeds the 280-char text budget", () => {
    const longText = "a".repeat(281);
    const profile = buildValidProfile({
      canonicalMessages: [
        {
          id: "m1",
          label: "label",
          text: longText,
          locked: false,
          maxRewritePolicy: "allow_light_rewrite",
        },
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /canonicalMessages\[0\]\.text:.*exceeds 280 chars/.test(e)),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// Source / completeness rule
// ---------------------------------------------------------------

describe("validateBrandProfile — source / completeness", () => {
  it("rejects a 'human_reviewed' profile with empty canonicalMessages", () => {
    const profile = buildValidProfile({
      source: "human_reviewed",
      canonicalMessages: [],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /source 'human_reviewed' requires a non-empty canonicalMessages list/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects a 'generated_draft' profile with empty canonicalMessages and no incompleteness note", () => {
    const profile = buildValidProfile({
      source: "generated_draft",
      canonicalMessages: [],
      safetyNotes: [
        "BrandProfile captures judgment, not visual implementation.",
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /empty canonicalMessages requires a safetyNote disclosing the incompleteness/.test(e),
      ),
    ).toBe(true);
  });

  it("allows a 'generated_draft' profile with empty canonicalMessages when a safety note discloses the draft state", () => {
    const profile = buildValidProfile({
      source: "generated_draft",
      canonicalMessages: [],
      safetyNotes: [
        "BrandProfile captures judgment, not visual implementation.",
        "This is a draft profile awaiting reviewer approval before any rendering.",
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(true);
  });

  it("allows a 'manual' profile with empty canonicalMessages when a safety note discloses incompleteness", () => {
    const profile = buildValidProfile({
      source: "manual",
      canonicalMessages: [],
      safetyNotes: [
        "BrandProfile captures judgment, not visual implementation.",
        "Canonical messages are placeholder for now and awaiting review.",
      ],
    });
    expect(validateBrandProfile(profile).ok).toBe(true);
  });
});

// ---------------------------------------------------------------
// Trust-posture rule
// ---------------------------------------------------------------

describe("validateBrandProfile — trust posture", () => {
  it("forbids claimPolicy 'allow_marketing_variants' under high_trust_review_required", () => {
    const profile = buildValidProfile({
      trustPosture: "high_trust_review_required",
      claimPolicy: "allow_marketing_variants",
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /trustPosture 'high_trust_review_required' forbids claimPolicy 'allow_marketing_variants'/.test(
          e,
        ),
      ),
    ).toBe(true);
  });

  it("requires a human-review safety note when high_trust_review_required + non-strict claim policy", () => {
    const profile = buildValidProfile({
      trustPosture: "high_trust_review_required",
      claimPolicy: "allow_light_rewrite",
      safetyNotes: ["Plain note that does not mention review."],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /requires a safetyNote disclosing human review/.test(e),
      ),
    ).toBe(true);
  });

  it("accepts high_trust_review_required + allow_light_rewrite when human review is disclosed", () => {
    const profile = buildValidProfile({
      trustPosture: "high_trust_review_required",
      claimPolicy: "allow_light_rewrite",
      safetyNotes: [
        "All non-canonical phrasing is gated on human review before it ships.",
      ],
    });
    expect(validateBrandProfile(profile).ok).toBe(true);
  });

  it("accepts high_trust_review_required + strict_canonical_only without a special note", () => {
    const profile = buildValidProfile({
      trustPosture: "high_trust_review_required",
      claimPolicy: "strict_canonical_only",
    });
    expect(validateBrandProfile(profile).ok).toBe(true);
  });
});

// ---------------------------------------------------------------
// Energy / motion rule
// ---------------------------------------------------------------

describe("validateBrandProfile — energy / motion", () => {
  it("forbids motionIntensity 'moderate' when energy is 'quiet'", () => {
    const profile = buildValidProfile({
      energy: "quiet",
      motionIntensity: "moderate",
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /energy 'quiet' forbids motionIntensity 'moderate'/.test(e),
      ),
    ).toBe(true);
  });

  it("allows motionIntensity 'subtle' with energy 'quiet'", () => {
    const profile = buildValidProfile({
      energy: "quiet",
      motionIntensity: "subtle",
    });
    expect(validateBrandProfile(profile).ok).toBe(true);
  });

  it("allows motionIntensity 'moderate' with energy 'expressive'", () => {
    const profile = buildValidProfile({
      energy: "expressive",
      motionIntensity: "moderate",
    });
    expect(validateBrandProfile(profile).ok).toBe(true);
  });
});

// ---------------------------------------------------------------
// Density / tone rule
// ---------------------------------------------------------------

describe("validateBrandProfile — density / tone", () => {
  it("rejects calm tone + dense visual density without a justifying safety note", () => {
    const profile = buildValidProfile({
      tone: "calm",
      visualDensity: "dense",
      safetyNotes: [
        "BrandProfile captures judgment, not visual implementation.",
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /tone 'calm' with visualDensity 'dense' requires a safetyNote that justifies the dense choice/.test(
          e,
        ),
      ),
    ).toBe(true);
  });

  it("allows calm tone + dense visual density when a safety note marks the dense choice as intentional", () => {
    const profile = buildValidProfile({
      tone: "calm",
      visualDensity: "dense",
      safetyNotes: [
        "BrandProfile captures judgment, not visual implementation.",
        "The dense layout is intentional to surface a long checklist on a single screen.",
      ],
    });
    expect(validateBrandProfile(profile).ok).toBe(true);
  });
});

// ---------------------------------------------------------------
// Visual-implementation banlist
// ---------------------------------------------------------------

describe("validateBrandProfile — visual-implementation banlist", () => {
  function expectVisualImplFailure(profile: BrandProfile) {
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /contains a visual-implementation token/.test(e),
      ),
    ).toBe(true);
  }

  it("rejects a hex color in canonical message text", () => {
    expectVisualImplFailure(
      buildValidProfile({
        canonicalMessages: [
          {
            id: "m1",
            label: "label",
            text: "Use brand color #ff5733 here.",
            locked: false,
            maxRewritePolicy: "allow_light_rewrite",
          },
        ],
      }),
    );
  });

  it("rejects a px / rem / ms unit in copy guidelines", () => {
    expectVisualImplFailure(
      buildValidProfile({
        copyGuidelines: ["Set padding to 16px between cards."],
      }),
    );
    expectVisualImplFailure(
      buildValidProfile({
        copyGuidelines: ["Animation duration 300ms is fine."],
      }),
    );
    expectVisualImplFailure(
      buildValidProfile({
        copyGuidelines: ["Use 1.5rem for body type."],
      }),
    );
  });

  it("rejects rgb()/hsl() color functions in canonical message text", () => {
    expectVisualImplFailure(
      buildValidProfile({
        canonicalMessages: [
          {
            id: "m1",
            label: "label",
            text: "Use rgb(0, 0, 0) for text.",
            locked: false,
            maxRewritePolicy: "allow_light_rewrite",
          },
        ],
      }),
    );
  });

  it("rejects a font-family name in displayName", () => {
    expectVisualImplFailure(
      buildValidProfile({ displayName: "Helvetica Studios" }),
    );
  });

  it("rejects a dotted CSS class name in safety notes", () => {
    expectVisualImplFailure(
      buildValidProfile({
        safetyNotes: [
          "BrandProfile captures judgment, not visual implementation.",
          "Apply .btn-primary to the primary CTA when rendering.",
        ],
      }),
    );
  });

  it("rejects a tailwind-style utility class in primary CTA action hint", () => {
    expectVisualImplFailure(
      buildValidProfile({
        primaryCtas: [
          {
            id: "fit",
            label: "Check fit",
            actionHint: "Render the CTA with bg-black text-white.",
            priority: "primary",
          },
        ],
      }),
    );
  });

  it("rejects an inline class= or style= attribute literal", () => {
    expectVisualImplFailure(
      buildValidProfile({
        copyGuidelines: ['Wrap the heading in style="color:black".'],
      }),
    );
  });
});

// ---------------------------------------------------------------
// Raw template / HTML banlist
// ---------------------------------------------------------------

describe("validateBrandProfile — raw template / HTML banlist", () => {
  function expectRawTemplateFailure(profile: BrandProfile) {
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /raw HTML \/ CSS \/ JSX \/ markdown \/ template fragment/.test(e),
      ),
    ).toBe(true);
  }

  it("rejects HTML opening tags in canonical message text", () => {
    expectRawTemplateFailure(
      buildValidProfile({
        canonicalMessages: [
          {
            id: "m1",
            label: "label",
            text: "Visit <b>our site</b> to learn more.",
            locked: false,
            maxRewritePolicy: "allow_light_rewrite",
          },
        ],
      }),
    );
  });

  it("rejects mustache / template-literal interpolation in copy guidelines", () => {
    expectRawTemplateFailure(
      buildValidProfile({
        copyGuidelines: ["Hello {{name}}, welcome to the site."],
      }),
    );
  });

  it("rejects markdown links in safety notes", () => {
    expectRawTemplateFailure(
      buildValidProfile({
        safetyNotes: [
          "BrandProfile captures judgment, not visual implementation.",
          "See [our docs](https://example.com) for details.",
        ],
      }),
    );
  });
});

// ---------------------------------------------------------------
// CTA / forbidden-phrase shape rules
// ---------------------------------------------------------------

describe("validateBrandProfile — CTA / forbidden-phrase shape", () => {
  it("flags a CTA label that exceeds the 40-char budget", () => {
    const profile = buildValidProfile({
      primaryCtas: [
        {
          id: "long_cta",
          label: "x".repeat(41),
          actionHint: "Open the long CTA.",
          priority: "primary",
        },
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /primaryCtas\[0\]\.label:.*exceeds 40 chars/.test(e)),
    ).toBe(true);
  });

  it("flags a CTA actionHint that exceeds the 80-char budget", () => {
    const profile = buildValidProfile({
      primaryCtas: [
        {
          id: "long_hint",
          label: "Click",
          actionHint: "x".repeat(81),
          priority: "primary",
        },
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /primaryCtas\[0\]\.actionHint:.*exceeds 80 chars/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a forbidden phrase that exceeds the 120-char budget", () => {
    const profile = buildValidProfile({
      forbiddenPhrases: [
        {
          phrase: "x".repeat(121),
          reason: "too long",
          severity: "block",
        },
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /forbiddenPhrases\[0\]\.phrase:.*exceeds 120 chars/.test(e),
      ),
    ).toBe(true);
  });

  it("flags duplicate primary CTA ids", () => {
    const profile = buildValidProfile({
      primaryCtas: [
        {
          id: "shared",
          label: "Click",
          actionHint: "Open A.",
          priority: "primary",
        },
        {
          id: "shared",
          label: "Click also",
          actionHint: "Open B.",
          priority: "secondary",
        },
      ],
    });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /duplicate cta id 'shared'/.test(e)),
    ).toBe(true);
  });

  it("flags an empty safetyNotes array", () => {
    const profile = buildValidProfile({ safetyNotes: [] });
    const r = validateBrandProfile(profile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /safetyNotes: must declare at least one note/.test(e),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// assertValidBrandProfile (throwing variant)
// ---------------------------------------------------------------

describe("assertValidBrandProfile", () => {
  it("does not throw for a valid default profile", () => {
    expect(() =>
      assertValidBrandProfile(createDefaultBrandProfile()),
    ).not.toThrow();
  });

  it("throws for an out-of-vocab tone", () => {
    expect(() =>
      assertValidBrandProfile(
        buildValidProfile({ tone: "evil_tone" as never }),
      ),
    ).toThrow(/tone 'evil_tone'/);
  });

  it("throws when a locked message uses 'allow_marketing_variants'", () => {
    expect(() =>
      assertValidBrandProfile(
        buildValidProfile({
          canonicalMessages: [
            {
              id: "m1",
              label: "label",
              text: "Plain message.",
              locked: true,
              maxRewritePolicy: "allow_marketing_variants",
            },
          ],
        }),
      ),
    ).toThrow(/locked canonical messages may not declare maxRewritePolicy 'allow_marketing_variants'/);
  });
});

// ---------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------

describe("isCanonicalMessageLocked", () => {
  it("returns true for locked messages and false for unlocked / undefined", () => {
    expect(
      isCanonicalMessageLocked({
        id: "x",
        label: "x",
        text: "x",
        locked: true,
        maxRewritePolicy: "strict_canonical_only",
      }),
    ).toBe(true);
    expect(
      isCanonicalMessageLocked({
        id: "x",
        label: "x",
        text: "x",
        locked: false,
        maxRewritePolicy: "allow_light_rewrite",
      }),
    ).toBe(false);
    expect(
      isCanonicalMessageLocked(undefined as unknown as CanonicalMessage),
    ).toBe(false);
  });
});

describe("getBlockedForbiddenPhrases", () => {
  it("returns only phrases whose severity is 'block'", () => {
    const profile = buildValidProfile({
      forbiddenPhrases: [
        { phrase: "phrase a", reason: "reason a", severity: "block" },
        { phrase: "phrase b", reason: "reason b", severity: "avoid" },
        { phrase: "phrase c", reason: "reason c", severity: "block" },
      ],
    });
    const blocked = getBlockedForbiddenPhrases(profile);
    expect(blocked.map((p) => p.phrase)).toEqual(["phrase a", "phrase c"]);
  });

  it("returns the four block-severity phrases for the platform default", () => {
    const blocked = getBlockedForbiddenPhrases(PLATFORM_DEFAULT_BRAND_PROFILE);
    expect(blocked.length).toBe(
      PLATFORM_DEFAULT_BRAND_PROFILE.forbiddenPhrases.filter(
        (p) => p.severity === "block",
      ).length,
    );
    for (const p of blocked) {
      expect(p.severity).toBe("block");
    }
  });
});

describe("getPrimaryCtas", () => {
  it("returns only CTAs whose priority is 'primary'", () => {
    const profile = buildValidProfile({
      primaryCtas: [
        {
          id: "a",
          label: "A",
          actionHint: "open a",
          priority: "primary",
        },
        {
          id: "b",
          label: "B",
          actionHint: "open b",
          priority: "secondary",
        },
        {
          id: "c",
          label: "C",
          actionHint: "open c",
          priority: "tertiary",
        },
        {
          id: "d",
          label: "D",
          actionHint: "open d",
          priority: "primary",
        },
      ],
    });
    const primary = getPrimaryCtas(profile);
    expect(primary.map((c) => c.id).sort()).toEqual(["a", "d"]);
  });
});

describe("getBrandProfileSummary", () => {
  it("returns scalar facets and counts that mirror the profile", () => {
    const summary = getBrandProfileSummary(PLATFORM_DEFAULT_BRAND_PROFILE);
    expect(summary.id).toBe("platform_default");
    expect(summary.tone).toBe("calm");
    expect(summary.canonicalMessageCount).toBe(
      PLATFORM_DEFAULT_BRAND_PROFILE.canonicalMessages.length,
    );
    expect(summary.lockedMessageCount).toBe(
      PLATFORM_DEFAULT_BRAND_PROFILE.canonicalMessages.filter((m) => m.locked)
        .length,
    );
    expect(summary.forbiddenPhraseCount).toBe(
      PLATFORM_DEFAULT_BRAND_PROFILE.forbiddenPhrases.length,
    );
  });
});

// ---------------------------------------------------------------
// mergeBrandProfileDraft
// ---------------------------------------------------------------

describe("mergeBrandProfileDraft", () => {
  it("preserves locked canonical messages from the base when the draft tries to overwrite them", () => {
    const merged = mergeBrandProfileDraft(PLATFORM_DEFAULT_BRAND_PROFILE, {
      canonicalMessages: [
        {
          id: "thesis_one_line",
          label: "Hijacked label",
          text: "An attacker tried to overwrite the locked thesis line.",
          locked: false,
          maxRewritePolicy: "allow_marketing_variants",
        },
      ],
    });

    const original = PLATFORM_DEFAULT_BRAND_PROFILE.canonicalMessages.find(
      (m) => m.id === "thesis_one_line",
    )!;
    const after = merged.canonicalMessages.find(
      (m) => m.id === "thesis_one_line",
    )!;
    expect(after).toBeTruthy();
    expect(after.text).toBe(original.text);
    expect(after.locked).toBe(true);
    expect(after.maxRewritePolicy).toBe(original.maxRewritePolicy);
  });

  it("appends new draft canonical messages that do not collide with locked base ids", () => {
    const merged = mergeBrandProfileDraft(PLATFORM_DEFAULT_BRAND_PROFILE, {
      canonicalMessages: [
        {
          id: "new_value_prop",
          label: "Value prop",
          text: "A new draft value prop that does not collide with locked ids.",
          locked: false,
          maxRewritePolicy: "allow_light_rewrite",
        },
      ],
    });
    expect(merged.canonicalMessages.map((m) => m.id)).toContain(
      "new_value_prop",
    );
    // Locked base ids still present.
    for (const m of PLATFORM_DEFAULT_BRAND_PROFILE.canonicalMessages) {
      if (m.locked) {
        expect(merged.canonicalMessages.find((x) => x.id === m.id)).toBeTruthy();
      }
    }
  });

  it("overrides scalar fields when the draft supplies them", () => {
    const merged = mergeBrandProfileDraft(PLATFORM_DEFAULT_BRAND_PROFILE, {
      tone: "warm",
      formality: "casual",
    });
    expect(merged.tone).toBe("warm");
    expect(merged.formality).toBe("casual");
    // Untouched fields stay on the base.
    expect(merged.energy).toBe(PLATFORM_DEFAULT_BRAND_PROFILE.energy);
    expect(merged.id).toBe(PLATFORM_DEFAULT_BRAND_PROFILE.id);
  });

  it("returns the base canonicalMessages unchanged when the draft does not supply them", () => {
    const merged = mergeBrandProfileDraft(PLATFORM_DEFAULT_BRAND_PROFILE, {
      tone: "warm",
    });
    expect(merged.canonicalMessages).toEqual(
      PLATFORM_DEFAULT_BRAND_PROFILE.canonicalMessages,
    );
  });
});

// ---------------------------------------------------------------
// Platform terminology + CoRent residue scan
// ---------------------------------------------------------------

describe("BrandProfile — platform terminology + no CoRent residue", () => {
  const profile = PLATFORM_DEFAULT_BRAND_PROFILE;

  function scan(
    location: string,
    value: string,
  ): { hit: boolean; term?: string } {
    const lower = value.toLowerCase();
    for (const term of CORENT_MARKETPLACE_TERMS) {
      if (lower.includes(term)) {
        return { hit: true, term };
      }
    }
    return { hit: false };
  }

  it("default profile id / displayName mention no CoRent marketplace terms", () => {
    const idScan = scan("id", profile.id);
    expect(idScan.hit).toBe(false);
    const displayNameScan = scan("displayName", profile.displayName);
    expect(displayNameScan.hit).toBe(false);
  });

  it("default canonical messages mention no CoRent marketplace terms", () => {
    for (const m of profile.canonicalMessages) {
      const idScan = scan(`canonicalMessages[${m.id}].id`, m.id);
      expect(idScan.hit).toBe(false);
      const labelScan = scan(`canonicalMessages[${m.id}].label`, m.label);
      expect(labelScan.hit).toBe(false);
      const textScan = scan(`canonicalMessages[${m.id}].text`, m.text);
      if (textScan.hit) {
        throw new Error(
          `canonicalMessages[${m.id}].text contains CoRent term '${textScan.term}': ${m.text}`,
        );
      }
    }
  });

  it("default forbidden phrases mention no CoRent marketplace terms", () => {
    for (const p of profile.forbiddenPhrases) {
      const phraseScan = scan(`forbiddenPhrases.phrase`, p.phrase);
      expect(phraseScan.hit).toBe(false);
      const reasonScan = scan(`forbiddenPhrases.reason`, p.reason);
      if (reasonScan.hit) {
        throw new Error(
          `forbiddenPhrases.reason contains CoRent term '${reasonScan.term}': ${p.reason}`,
        );
      }
    }
  });

  it("default primary CTAs mention no CoRent marketplace terms", () => {
    for (const c of profile.primaryCtas) {
      const idScan = scan(`primaryCtas[${c.id}].id`, c.id);
      expect(idScan.hit).toBe(false);
      const labelScan = scan(`primaryCtas[${c.id}].label`, c.label);
      expect(labelScan.hit).toBe(false);
      const hintScan = scan(`primaryCtas[${c.id}].actionHint`, c.actionHint);
      expect(hintScan.hit).toBe(false);
    }
  });

  it("default copyGuidelines and safetyNotes mention no CoRent marketplace terms", () => {
    for (let i = 0; i < profile.copyGuidelines.length; i++) {
      const guideline = profile.copyGuidelines[i]!;
      const s = scan(`copyGuidelines[${i}]`, guideline);
      if (s.hit) {
        throw new Error(
          `copyGuidelines[${i}] contains CoRent term '${s.term}': ${guideline}`,
        );
      }
    }
    for (let i = 0; i < profile.safetyNotes.length; i++) {
      const note = profile.safetyNotes[i]!;
      const s = scan(`safetyNotes[${i}]`, note);
      if (s.hit) {
        throw new Error(
          `safetyNotes[${i}] contains CoRent term '${s.term}': ${note}`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------
// Import boundary + I/O surface
// ---------------------------------------------------------------

describe("BrandProfile — import boundary", () => {
  it("does NOT import from @/server/**", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("does NOT import any LLM provider / runtime / mock invoker", () => {
    expect(IMPORT_BLOB).not.toMatch(/anthropic|openai/i);
    expect(IMPORT_BLOB).not.toMatch(/@\/server\/llm/);
    expect(IMPORT_BLOB).not.toMatch(/llmAdapter/);
    expect(IMPORT_BLOB).not.toMatch(/\binvoke\b/);
    expect(IMPORT_BLOB).not.toMatch(/mockAdapter/);
  });

  it("does NOT import any Supabase client / SSR / persistence module", () => {
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/supabase-js/);
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/ssr/);
    expect(IMPORT_BLOB).not.toMatch(/persistence\/supabase\/client/);
    expect(IMPORT_BLOB).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  });

  it("does NOT import payment / claim / trust / handoff-service / notification / feedback / wanted-write modules", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/from\s+["'][^"']*\/handoff(?:Service|\/)/i);
    expect(IMPORT_BLOB).not.toMatch(/notifications?/i);
    expect(IMPORT_BLOB).not.toMatch(/webhook/i);
    expect(IMPORT_BLOB).not.toMatch(/feedback/i);
    expect(IMPORT_BLOB).not.toMatch(/submitFeedback/);
  });

  it("does NOT import React (this is a pure data primitive, not UI)", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']react["']/);
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']react\//);
    expect(IMPORT_BLOB).not.toMatch(/jsx-runtime/);
  });

  it("does NOT call any I/O surface (process.env / fetch / XMLHttpRequest / fs)", () => {
    expect(RUNTIME_SRC).not.toMatch(/process\.env/);
    expect(RUNTIME_SRC).not.toMatch(/\bfetch\(/);
    expect(RUNTIME_SRC).not.toMatch(/\bXMLHttpRequest\b/);
    expect(RUNTIME_SRC).not.toMatch(/readFile|writeFile|require\(/);
  });

  it("imports nothing — BrandProfile is a self-contained primitive", () => {
    const imports = IMPORT_BLOB.match(/from\s+["']([^"']+)["']/g) ?? [];
    expect(imports.length).toBe(0);
  });
});
