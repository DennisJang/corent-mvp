// CoRent Interactive Experience — BrandProfile v1.
//
// Plan / authority:
//   docs/platform_thesis_ai_interaction_layer.md (§4 the
//     primitive model — BrandProfile sits next to KnowledgeSource
//     and ComponentBlock as the customer-judgment surface).
//   docs/interaction_safety_standard_v0.md (§3 trust posture,
//     §6 deterministic authority, §10 user-facing copy rules).
//   docs/platform_pivot_note_2026-05-07.md §9 (next build
//     target after Action registry v1).
//
// Purpose:
//
//   Pure-data, type-only manifest of a host site's brand
//   judgment — tone, formality, energy, trust posture, visual
//   density, motion intensity, CTA style, claim policy,
//   canonical messages, forbidden phrases, primary CTAs, copy
//   guidelines, and safety notes. **It does not describe visual
//   implementation.** Customers do not configure colors, fonts,
//   px/rem, radii, shadow, animation timing, CSS class names,
//   or layout instructions; the platform absorbs those.
//
//   ComponentBlock defines what can be SHOWN; Action defines
//   what can be REQUESTED. BrandProfile defines HOW the
//   visible / requestable surface should feel — without leaking
//   visual implementation back into the customer's hands.
//
// Hard rules pinned in this file:
//
//   - Pure data + pure functions. No I/O, no env, no network,
//     no Supabase, no LLM, no React, no DOM. Importing this
//     module is free.
//   - Closed vocabularies for tone, formality, energy, trust
//     posture, visual density, motion intensity, CTA style,
//     language, claim policy, source, severity, and CTA
//     priority. The validator refuses any out-of-vocab value.
//   - **Visual-implementation banlist.** Hex colors, CSS units
//     (px / rem / em / vh / vw / pt / ms), `rgb()` / `hsl()`
//     functions, common font-family names, dotted CSS class
//     names, tailwind-style utility classes, and inline `class=`
//     / `style=` attributes are refused in any string-bearing
//     field. BrandProfile captures judgment, not implementation.
//   - **Raw template / HTML / markdown banlist.** Strings that
//     look like raw HTML / CSS / JSX / markdown / template
//     literals are refused.
//   - **Trust-posture rule.** `high_trust_review_required`
//     forbids `claimPolicy === "allow_marketing_variants"`. Any
//     claimPolicy other than `strict_canonical_only` requires a
//     safety note disclosing human review.
//   - **Energy / motion rule.** `energy === "quiet"` forbids
//     `motionIntensity === "moderate"`.
//   - **Density / tone rule.** `visualDensity === "dense"` is
//     not allowed with `tone === "calm"` unless a safety note
//     explicitly justifies the dense choice.
//   - **Locked-message rule.** A canonicalMessage with
//     `locked: true` may not declare
//     `maxRewritePolicy === "allow_marketing_variants"` —
//     locked phrasing must stay verbatim or near-verbatim.
//   - **Source / completeness rule.** A
//     `source === "human_reviewed"` profile must declare a
//     non-empty `canonicalMessages`. A `manual` /
//     `generated_draft` profile may start empty only if its
//     safetyNotes disclose the incompleteness.
//
// What this module is NOT:
//
//   - Not a CSS / theme / token generator. v1 emits no CSS, no
//     style strings, no design tokens.
//   - Not a customer-facing visual editor.
//   - Not a website crawler / brand extractor. The
//     `imported_from_site` source value exists for a future
//     slice; v1 does not import anything.
//   - Not wired into any UI surface, route, or server action.

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

export const BRAND_TONES = [
  "professional",
  "warm",
  "premium",
  "direct",
  "friendly",
  "calm",
  "technical",
  "playful",
] as const;
export type BrandTone = (typeof BRAND_TONES)[number];

export const BRAND_FORMALITIES = ["casual", "balanced", "formal"] as const;
export type BrandFormality = (typeof BRAND_FORMALITIES)[number];

export const BRAND_ENERGIES = ["quiet", "balanced", "expressive"] as const;
export type BrandEnergy = (typeof BRAND_ENERGIES)[number];

export const BRAND_TRUST_POSTURES = [
  "low_risk_public",
  "careful_service",
  "high_trust_review_required",
] as const;
export type BrandTrustPosture = (typeof BRAND_TRUST_POSTURES)[number];

export const BRAND_VISUAL_DENSITIES = ["sparse", "balanced", "dense"] as const;
export type BrandVisualDensity = (typeof BRAND_VISUAL_DENSITIES)[number];

export const BRAND_MOTION_INTENSITIES = [
  "none",
  "subtle",
  "moderate",
] as const;
export type BrandMotionIntensity = (typeof BRAND_MOTION_INTENSITIES)[number];

export const BRAND_CTA_STYLES = [
  "direct",
  "consultative",
  "educational",
  "exploratory",
] as const;
export type BrandCtaStyle = (typeof BRAND_CTA_STYLES)[number];

export const BRAND_LANGUAGES = ["ko", "en", "bilingual"] as const;
export type BrandLanguage = (typeof BRAND_LANGUAGES)[number];

export const BRAND_CLAIM_POLICIES = [
  "strict_canonical_only",
  "allow_light_rewrite",
  "allow_marketing_variants",
] as const;
export type BrandClaimPolicy = (typeof BRAND_CLAIM_POLICIES)[number];

export const BRAND_PROFILE_SOURCES = [
  "manual",
  "imported_from_site",
  "generated_draft",
  "human_reviewed",
] as const;
export type BrandProfileSource = (typeof BRAND_PROFILE_SOURCES)[number];

export const FORBIDDEN_PHRASE_SEVERITIES = ["avoid", "block"] as const;
export type ForbiddenPhraseSeverity = (typeof FORBIDDEN_PHRASE_SEVERITIES)[number];

export const BRAND_CTA_PRIORITIES = [
  "primary",
  "secondary",
  "tertiary",
] as const;
export type BrandCtaPriority = (typeof BRAND_CTA_PRIORITIES)[number];

// ---------------------------------------------------------------
// Length budgets
// ---------------------------------------------------------------

const MAX_DISPLAY_NAME_CHARS = 80;
const MAX_CANONICAL_LABEL_CHARS = 80;
const MAX_CANONICAL_TEXT_CHARS = 280;
const MAX_CANONICAL_SOURCE_CHARS = 240;
const MAX_FORBIDDEN_PHRASE_CHARS = 120;
const MAX_FORBIDDEN_REASON_CHARS = 240;
const MAX_CTA_LABEL_CHARS = 40;
const MAX_CTA_ACTION_HINT_CHARS = 80;
const MAX_COPY_GUIDELINE_CHARS = 160;
const MAX_SAFETY_NOTE_CHARS = 240;

// ---------------------------------------------------------------
// Definition shape
// ---------------------------------------------------------------

export type CanonicalMessage = {
  id: string;
  label: string;
  text: string;
  source?: string;
  locked: boolean;
  maxRewritePolicy: BrandClaimPolicy;
};

export type ForbiddenPhrase = {
  phrase: string;
  reason: string;
  severity: ForbiddenPhraseSeverity;
};

export type BrandCta = {
  id: string;
  label: string;
  actionHint: string;
  priority: BrandCtaPriority;
};

export type BrandProfile = {
  id: string;
  displayName: string;
  source: BrandProfileSource;
  language: BrandLanguage;
  tone: BrandTone;
  formality: BrandFormality;
  energy: BrandEnergy;
  trustPosture: BrandTrustPosture;
  visualDensity: BrandVisualDensity;
  motionIntensity: BrandMotionIntensity;
  ctaStyle: BrandCtaStyle;
  claimPolicy: BrandClaimPolicy;
  canonicalMessages: ReadonlyArray<CanonicalMessage>;
  forbiddenPhrases: ReadonlyArray<ForbiddenPhrase>;
  primaryCtas: ReadonlyArray<BrandCta>;
  copyGuidelines: ReadonlyArray<string>;
  safetyNotes: ReadonlyArray<string>;
};

// ---------------------------------------------------------------
// Banlists used by the validator
// ---------------------------------------------------------------

// Visual-implementation patterns that must NEVER appear in a
// BrandProfile field. BrandProfile is judgment, not CSS.
const VISUAL_IMPLEMENTATION_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  {
    label: "hex color",
    pattern: /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/,
  },
  {
    label: "css unit (px/rem/em/vh/vw/pt/ms)",
    pattern: /\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|pt|ms)\b/i,
  },
  {
    label: "rgb()/hsl() color function",
    pattern: /\b(?:rgb|rgba|hsl|hsla)\s*\(/i,
  },
  {
    label: "common font-family name",
    pattern:
      /\b(?:helvetica|arial|roboto|inter|verdana|georgia|tahoma|palatino|courier|times new roman|sans-serif|serif|monospace)\b/i,
  },
  {
    label: "dotted CSS class name",
    pattern: /(?:^|\s)\.[a-z][a-zA-Z0-9_-]{2,}\b/,
  },
  {
    label: "tailwind-style utility class",
    pattern:
      /\b(?:bg|text|flex|grid|font|border|rounded|shadow|animate|transition|p[xytrbl]?|m[xytrbl]?|w|h)-[a-z0-9]+(?:-[a-z0-9]+)*\b/,
  },
  {
    label: "inline class= or style= attribute",
    pattern: /(?:^|\s)(?:class|style)\s*=\s*["']/i,
  },
];

// Raw HTML / CSS / JSX / markdown / template fragment patterns.
// Same set used in ComponentBlock and Action validators.
const RAW_TEMPLATE_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "HTML opening tag", pattern: /<[a-zA-Z][^>]*>/ },
  { label: "HTML closing tag", pattern: /<\/[a-zA-Z]+>/ },
  { label: "mustache template", pattern: /\{\{[\s\S]*?\}\}/ },
  { label: "ejs/erb template", pattern: /<%[\s\S]*?%>/ },
  {
    label: "template-literal interpolation",
    pattern: /\$\{[\s\S]*?\}/,
  },
  { label: "markdown link", pattern: /\[[^\]\n]+\]\([^)\n]+\)/ },
  { label: "markdown heading", pattern: /^#{1,6}\s/m },
  { label: "markdown code fence", pattern: /```/ },
];

// Phrases that disclose human review. Used to satisfy the
// trust-posture rule: a `high_trust_review_required` profile
// whose claimPolicy is not `strict_canonical_only` must declare
// a safety note that mentions human review.
const HUMAN_REVIEW_DISCLOSURE_PATTERNS: ReadonlyArray<RegExp> = [
  /human\s+review/i,
  /human-review/i,
  /reviewer\s+approval/i,
  /human\s+approval/i,
];

// Phrases that satisfy the dense + calm justification rule. At
// least one safety note must mention "dense" plus an
// intentionality keyword.
const DENSE_JUSTIFICATION_PATTERNS: ReadonlyArray<RegExp> = [
  /\bdense\b[\s\S]*?\b(?:intentional|justified|deliberate|required|necessary|approved)\b/i,
  /\b(?:intentional|justified|deliberate|required|necessary|approved)\b[\s\S]*?\bdense\b/i,
];

// Phrases an `imported_from_site` / `generated_draft` /
// `manual` profile may use in safetyNotes to disclose its
// incompleteness when canonicalMessages is empty.
const INCOMPLETENESS_DISCLOSURE_PATTERNS: ReadonlyArray<RegExp> = [
  /not\s+yet\s+reviewed/i,
  /awaiting\s+review/i,
  /draft/i,
  /incomplete/i,
  /placeholder/i,
  /stub/i,
];

// ---------------------------------------------------------------
// Helper sets
// ---------------------------------------------------------------

const ALLOWED_TONE_SET = new Set<BrandTone>(BRAND_TONES);
const ALLOWED_FORMALITY_SET = new Set<BrandFormality>(BRAND_FORMALITIES);
const ALLOWED_ENERGY_SET = new Set<BrandEnergy>(BRAND_ENERGIES);
const ALLOWED_TRUST_POSTURE_SET = new Set<BrandTrustPosture>(
  BRAND_TRUST_POSTURES,
);
const ALLOWED_VISUAL_DENSITY_SET = new Set<BrandVisualDensity>(
  BRAND_VISUAL_DENSITIES,
);
const ALLOWED_MOTION_INTENSITY_SET = new Set<BrandMotionIntensity>(
  BRAND_MOTION_INTENSITIES,
);
const ALLOWED_CTA_STYLE_SET = new Set<BrandCtaStyle>(BRAND_CTA_STYLES);
const ALLOWED_LANGUAGE_SET = new Set<BrandLanguage>(BRAND_LANGUAGES);
const ALLOWED_CLAIM_POLICY_SET = new Set<BrandClaimPolicy>(
  BRAND_CLAIM_POLICIES,
);
const ALLOWED_SOURCE_SET = new Set<BrandProfileSource>(BRAND_PROFILE_SOURCES);
const ALLOWED_SEVERITY_SET = new Set<ForbiddenPhraseSeverity>(
  FORBIDDEN_PHRASE_SEVERITIES,
);
const ALLOWED_CTA_PRIORITY_SET = new Set<BrandCtaPriority>(
  BRAND_CTA_PRIORITIES,
);

// ---------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function matchesAny(
  value: string,
  patterns: ReadonlyArray<RegExp>,
): RegExp | null {
  for (const pattern of patterns) {
    if (pattern.test(value)) return pattern;
  }
  return null;
}

function findVisualImplHit(value: string): { label: string } | null {
  for (const { label, pattern } of VISUAL_IMPLEMENTATION_PATTERNS) {
    if (pattern.test(value)) return { label };
  }
  return null;
}

function findRawTemplateHit(value: string): { label: string } | null {
  for (const { label, pattern } of RAW_TEMPLATE_PATTERNS) {
    if (pattern.test(value)) return { label };
  }
  return null;
}

function pushTextChecks(
  errors: string[],
  fieldLabel: string,
  value: string | undefined,
  options: { maxChars: number; allowEmpty?: boolean },
): void {
  if (typeof value !== "string") {
    errors.push(`${fieldLabel}: must be a string`);
    return;
  }
  if (!options.allowEmpty && value.trim().length === 0) {
    errors.push(`${fieldLabel}: must be a non-empty string`);
    return;
  }
  if (value.length > options.maxChars) {
    errors.push(
      `${fieldLabel}: exceeds ${options.maxChars} chars (got ${value.length})`,
    );
  }
  const visualHit = findVisualImplHit(value);
  if (visualHit) {
    errors.push(
      `${fieldLabel}: contains a visual-implementation token (${visualHit.label}) — BrandProfile captures judgment, not CSS`,
    );
  }
  const rawHit = findRawTemplateHit(value);
  if (rawHit) {
    errors.push(
      `${fieldLabel}: contains a raw HTML / CSS / JSX / markdown / template fragment (${rawHit.label})`,
    );
  }
}

// ---------------------------------------------------------------
// Default platform profile
// ---------------------------------------------------------------

export const PLATFORM_DEFAULT_BRAND_PROFILE: BrandProfile = {
  id: "platform_default",
  displayName: "Platform",
  source: "manual",
  language: "bilingual",
  tone: "calm",
  formality: "balanced",
  energy: "quiet",
  trustPosture: "careful_service",
  visualDensity: "sparse",
  motionIntensity: "subtle",
  ctaStyle: "consultative",
  claimPolicy: "strict_canonical_only",
  canonicalMessages: [
    {
      id: "thesis_one_line",
      label: "Platform thesis (one line)",
      text:
        "We turn complex websites into purpose-driven interactive interfaces.",
      locked: true,
      maxRewritePolicy: "strict_canonical_only",
    },
    {
      id: "not_a_chatbot",
      label: "Not a chatbot",
      text: "We are not building a chatbot.",
      locked: true,
      maxRewritePolicy: "strict_canonical_only",
    },
    {
      id: "primitive_authority_summary",
      label: "Primitive authority summary",
      text:
        "The platform uses registered knowledge, approved components, registered actions, deterministic authority, and reviewable logs.",
      locked: true,
      maxRewritePolicy: "strict_canonical_only",
    },
  ],
  forbiddenPhrases: [
    {
      phrase: "autonomous agent",
      reason: "Implies operational autonomy the platform does not have.",
      severity: "block",
    },
    {
      phrase: "fully automatic decision",
      reason: "Implies decision authority the platform does not hold.",
      severity: "block",
    },
    {
      phrase: "guaranteed conversion",
      reason: "Promises an outcome the platform cannot guarantee.",
      severity: "block",
    },
    {
      phrase: "replaces human judgment",
      reason:
        "Implies displacement of human responsibility — contrary to safety standard.",
      severity: "block",
    },
  ],
  primaryCtas: [
    {
      id: "check_site_fit",
      label: "Check site fit",
      actionHint: "Open a guided fit check for a candidate host site.",
      priority: "primary",
    },
    {
      id: "see_how_it_works",
      label: "See how it works",
      actionHint: "Show the primitive walkthrough page.",
      priority: "secondary",
    },
  ],
  copyGuidelines: [
    "Prefer plain calm sentences over marketing language.",
    "Reference registered facts before adding new statements.",
    "Use canonical messages verbatim when accuracy matters.",
  ],
  safetyNotes: [
    "BrandProfile captures judgment, not visual implementation.",
    "Customers should not configure color, layout, or motion timing directly.",
    "Locked canonical messages preserve trust-critical phrasing across rewrites.",
  ],
};

// ---------------------------------------------------------------
// Constructor + query helpers
// ---------------------------------------------------------------

export function createDefaultBrandProfile(
  input: Partial<BrandProfile> = {},
): BrandProfile {
  return {
    ...PLATFORM_DEFAULT_BRAND_PROFILE,
    ...input,
    canonicalMessages:
      input.canonicalMessages ??
      PLATFORM_DEFAULT_BRAND_PROFILE.canonicalMessages,
    forbiddenPhrases:
      input.forbiddenPhrases ?? PLATFORM_DEFAULT_BRAND_PROFILE.forbiddenPhrases,
    primaryCtas:
      input.primaryCtas ?? PLATFORM_DEFAULT_BRAND_PROFILE.primaryCtas,
    copyGuidelines:
      input.copyGuidelines ?? PLATFORM_DEFAULT_BRAND_PROFILE.copyGuidelines,
    safetyNotes: input.safetyNotes ?? PLATFORM_DEFAULT_BRAND_PROFILE.safetyNotes,
  };
}

export function isCanonicalMessageLocked(message: CanonicalMessage): boolean {
  return message?.locked === true;
}

export function getBlockedForbiddenPhrases(
  profile: BrandProfile,
): ReadonlyArray<ForbiddenPhrase> {
  return profile.forbiddenPhrases.filter((p) => p.severity === "block");
}

export function getPrimaryCtas(profile: BrandProfile): ReadonlyArray<BrandCta> {
  return profile.primaryCtas.filter((c) => c.priority === "primary");
}

export type BrandProfileSummary = {
  id: string;
  displayName: string;
  tone: BrandTone;
  formality: BrandFormality;
  energy: BrandEnergy;
  trustPosture: BrandTrustPosture;
  claimPolicy: BrandClaimPolicy;
  language: BrandLanguage;
  canonicalMessageCount: number;
  forbiddenPhraseCount: number;
  primaryCtaCount: number;
  lockedMessageCount: number;
};

export function getBrandProfileSummary(
  profile: BrandProfile,
): BrandProfileSummary {
  return {
    id: profile.id,
    displayName: profile.displayName,
    tone: profile.tone,
    formality: profile.formality,
    energy: profile.energy,
    trustPosture: profile.trustPosture,
    claimPolicy: profile.claimPolicy,
    language: profile.language,
    canonicalMessageCount: profile.canonicalMessages.length,
    forbiddenPhraseCount: profile.forbiddenPhrases.length,
    primaryCtaCount: profile.primaryCtas.length,
    lockedMessageCount: profile.canonicalMessages.filter((m) =>
      isCanonicalMessageLocked(m),
    ).length,
  };
}

// Merges a draft profile onto a base. Locked canonical messages
// in the base are preserved verbatim — a draft cannot overwrite
// or remove them. Unlocked base messages may be replaced by
// draft entries with the same id; new draft ids are appended.
// All other top-level fields take the draft value when present.
export function mergeBrandProfileDraft(
  base: BrandProfile,
  draft: Partial<BrandProfile>,
): BrandProfile {
  const lockedBase = base.canonicalMessages.filter((m) =>
    isCanonicalMessageLocked(m),
  );
  const lockedBaseIds = new Set<string>(lockedBase.map((m) => m.id));

  const merged: BrandProfile = {
    ...base,
    ...draft,
    canonicalMessages: base.canonicalMessages,
    forbiddenPhrases: base.forbiddenPhrases,
    primaryCtas: base.primaryCtas,
    copyGuidelines: base.copyGuidelines,
    safetyNotes: base.safetyNotes,
  };

  if (draft.canonicalMessages !== undefined) {
    const result: CanonicalMessage[] = [...lockedBase];
    for (const dm of draft.canonicalMessages) {
      if (lockedBaseIds.has(dm.id)) continue;
      result.push(dm);
    }
    merged.canonicalMessages = result;
  }
  if (draft.forbiddenPhrases !== undefined) {
    merged.forbiddenPhrases = draft.forbiddenPhrases;
  }
  if (draft.primaryCtas !== undefined) {
    merged.primaryCtas = draft.primaryCtas;
  }
  if (draft.copyGuidelines !== undefined) {
    merged.copyGuidelines = draft.copyGuidelines;
  }
  if (draft.safetyNotes !== undefined) {
    merged.safetyNotes = draft.safetyNotes;
  }

  return merged;
}

// ---------------------------------------------------------------
// Validators
// ---------------------------------------------------------------

export type BrandProfileValidationResult =
  | { ok: true }
  | { ok: false; errors: ReadonlyArray<string> };

export function assertValidBrandProfile(profile: BrandProfile): void {
  const result = validateBrandProfile(profile);
  if (!result.ok) {
    throw new Error(
      `Invalid BrandProfile '${String(profile?.id ?? "<unknown>")}':\n  - ${result.errors.join(
        "\n  - ",
      )}`,
    );
  }
}

export function validateBrandProfile(
  profile: BrandProfile,
): BrandProfileValidationResult {
  const errors: string[] = [];
  const idLabel = isNonEmptyString(profile?.id)
    ? profile.id
    : "<missing id>";

  // id + displayName non-empty.
  if (!isNonEmptyString(profile?.id)) {
    errors.push(`id: must be a non-empty string`);
  }
  pushTextChecks(errors, `${idLabel}.displayName`, profile?.displayName, {
    maxChars: MAX_DISPLAY_NAME_CHARS,
  });

  // Closed-vocab membership.
  if (!ALLOWED_SOURCE_SET.has(profile?.source as BrandProfileSource)) {
    errors.push(
      `${idLabel}: source '${String(profile?.source)}' is not in BRAND_PROFILE_SOURCES`,
    );
  }
  if (!ALLOWED_LANGUAGE_SET.has(profile?.language as BrandLanguage)) {
    errors.push(
      `${idLabel}: language '${String(profile?.language)}' is not in BRAND_LANGUAGES`,
    );
  }
  if (!ALLOWED_TONE_SET.has(profile?.tone as BrandTone)) {
    errors.push(
      `${idLabel}: tone '${String(profile?.tone)}' is not in BRAND_TONES`,
    );
  }
  if (!ALLOWED_FORMALITY_SET.has(profile?.formality as BrandFormality)) {
    errors.push(
      `${idLabel}: formality '${String(profile?.formality)}' is not in BRAND_FORMALITIES`,
    );
  }
  if (!ALLOWED_ENERGY_SET.has(profile?.energy as BrandEnergy)) {
    errors.push(
      `${idLabel}: energy '${String(profile?.energy)}' is not in BRAND_ENERGIES`,
    );
  }
  if (
    !ALLOWED_TRUST_POSTURE_SET.has(profile?.trustPosture as BrandTrustPosture)
  ) {
    errors.push(
      `${idLabel}: trustPosture '${String(profile?.trustPosture)}' is not in BRAND_TRUST_POSTURES`,
    );
  }
  if (
    !ALLOWED_VISUAL_DENSITY_SET.has(
      profile?.visualDensity as BrandVisualDensity,
    )
  ) {
    errors.push(
      `${idLabel}: visualDensity '${String(profile?.visualDensity)}' is not in BRAND_VISUAL_DENSITIES`,
    );
  }
  if (
    !ALLOWED_MOTION_INTENSITY_SET.has(
      profile?.motionIntensity as BrandMotionIntensity,
    )
  ) {
    errors.push(
      `${idLabel}: motionIntensity '${String(profile?.motionIntensity)}' is not in BRAND_MOTION_INTENSITIES`,
    );
  }
  if (!ALLOWED_CTA_STYLE_SET.has(profile?.ctaStyle as BrandCtaStyle)) {
    errors.push(
      `${idLabel}: ctaStyle '${String(profile?.ctaStyle)}' is not in BRAND_CTA_STYLES`,
    );
  }
  if (!ALLOWED_CLAIM_POLICY_SET.has(profile?.claimPolicy as BrandClaimPolicy)) {
    errors.push(
      `${idLabel}: claimPolicy '${String(profile?.claimPolicy)}' is not in BRAND_CLAIM_POLICIES`,
    );
  }

  // Array shape.
  if (!Array.isArray(profile?.canonicalMessages)) {
    errors.push(`${idLabel}: canonicalMessages must be an array`);
  }
  if (!Array.isArray(profile?.forbiddenPhrases)) {
    errors.push(`${idLabel}: forbiddenPhrases must be an array`);
  }
  if (!Array.isArray(profile?.primaryCtas)) {
    errors.push(`${idLabel}: primaryCtas must be an array`);
  }
  if (!Array.isArray(profile?.copyGuidelines)) {
    errors.push(`${idLabel}: copyGuidelines must be an array`);
  }
  if (!Array.isArray(profile?.safetyNotes)) {
    errors.push(`${idLabel}: safetyNotes must be an array`);
  }

  // Per-canonical-message integrity.
  if (Array.isArray(profile?.canonicalMessages)) {
    const seenIds = new Set<string>();
    for (let i = 0; i < profile.canonicalMessages.length; i++) {
      const msg = profile.canonicalMessages[i]!;
      const messageLabel = `${idLabel}.canonicalMessages[${i}]`;
      if (!isNonEmptyString(msg?.id)) {
        errors.push(`${messageLabel}: id must be a non-empty string`);
      } else if (seenIds.has(msg.id)) {
        errors.push(
          `${messageLabel}: duplicate canonical message id '${msg.id}'`,
        );
      } else {
        seenIds.add(msg.id);
      }
      pushTextChecks(errors, `${messageLabel}.label`, msg?.label, {
        maxChars: MAX_CANONICAL_LABEL_CHARS,
      });
      pushTextChecks(errors, `${messageLabel}.text`, msg?.text, {
        maxChars: MAX_CANONICAL_TEXT_CHARS,
      });
      if (msg?.source !== undefined) {
        pushTextChecks(errors, `${messageLabel}.source`, msg.source, {
          maxChars: MAX_CANONICAL_SOURCE_CHARS,
        });
      }
      if (typeof msg?.locked !== "boolean") {
        errors.push(`${messageLabel}.locked: must be a boolean`);
      }
      if (
        !ALLOWED_CLAIM_POLICY_SET.has(msg?.maxRewritePolicy as BrandClaimPolicy)
      ) {
        errors.push(
          `${messageLabel}.maxRewritePolicy: '${String(msg?.maxRewritePolicy)}' is not in BRAND_CLAIM_POLICIES`,
        );
      }
      if (
        msg?.locked === true &&
        msg.maxRewritePolicy === "allow_marketing_variants"
      ) {
        errors.push(
          `${messageLabel}: locked canonical messages may not declare maxRewritePolicy 'allow_marketing_variants'`,
        );
      }
    }
  }

  // Per-forbidden-phrase integrity.
  if (Array.isArray(profile?.forbiddenPhrases)) {
    for (let i = 0; i < profile.forbiddenPhrases.length; i++) {
      const fp = profile.forbiddenPhrases[i]!;
      const phraseLabel = `${idLabel}.forbiddenPhrases[${i}]`;
      pushTextChecks(errors, `${phraseLabel}.phrase`, fp?.phrase, {
        maxChars: MAX_FORBIDDEN_PHRASE_CHARS,
      });
      pushTextChecks(errors, `${phraseLabel}.reason`, fp?.reason, {
        maxChars: MAX_FORBIDDEN_REASON_CHARS,
      });
      if (
        !ALLOWED_SEVERITY_SET.has(fp?.severity as ForbiddenPhraseSeverity)
      ) {
        errors.push(
          `${phraseLabel}.severity: '${String(fp?.severity)}' is not in FORBIDDEN_PHRASE_SEVERITIES`,
        );
      }
    }
  }

  // Per-primary-cta integrity.
  if (Array.isArray(profile?.primaryCtas)) {
    const seenCtaIds = new Set<string>();
    for (let i = 0; i < profile.primaryCtas.length; i++) {
      const cta = profile.primaryCtas[i]!;
      const ctaLabel = `${idLabel}.primaryCtas[${i}]`;
      if (!isNonEmptyString(cta?.id)) {
        errors.push(`${ctaLabel}.id: must be a non-empty string`);
      } else if (seenCtaIds.has(cta.id)) {
        errors.push(`${ctaLabel}: duplicate cta id '${cta.id}'`);
      } else {
        seenCtaIds.add(cta.id);
      }
      pushTextChecks(errors, `${ctaLabel}.label`, cta?.label, {
        maxChars: MAX_CTA_LABEL_CHARS,
      });
      pushTextChecks(errors, `${ctaLabel}.actionHint`, cta?.actionHint, {
        maxChars: MAX_CTA_ACTION_HINT_CHARS,
      });
      if (!ALLOWED_CTA_PRIORITY_SET.has(cta?.priority as BrandCtaPriority)) {
        errors.push(
          `${ctaLabel}.priority: '${String(cta?.priority)}' is not in BRAND_CTA_PRIORITIES`,
        );
      }
    }
  }

  // copyGuidelines integrity.
  if (Array.isArray(profile?.copyGuidelines)) {
    for (let i = 0; i < profile.copyGuidelines.length; i++) {
      pushTextChecks(
        errors,
        `${idLabel}.copyGuidelines[${i}]`,
        profile.copyGuidelines[i],
        { maxChars: MAX_COPY_GUIDELINE_CHARS },
      );
    }
  }

  // safetyNotes integrity.
  if (Array.isArray(profile?.safetyNotes)) {
    if (profile.safetyNotes.length === 0) {
      errors.push(`${idLabel}.safetyNotes: must declare at least one note`);
    }
    for (let i = 0; i < profile.safetyNotes.length; i++) {
      pushTextChecks(
        errors,
        `${idLabel}.safetyNotes[${i}]`,
        profile.safetyNotes[i],
        { maxChars: MAX_SAFETY_NOTE_CHARS },
      );
    }
  }

  // Source / completeness rule.
  if (
    profile?.source === "human_reviewed" &&
    Array.isArray(profile.canonicalMessages) &&
    profile.canonicalMessages.length === 0
  ) {
    errors.push(
      `${idLabel}: source 'human_reviewed' requires a non-empty canonicalMessages list`,
    );
  }
  if (
    Array.isArray(profile?.canonicalMessages) &&
    profile.canonicalMessages.length === 0 &&
    profile.source !== "human_reviewed" &&
    Array.isArray(profile.safetyNotes)
  ) {
    const hasIncompletenessNote = profile.safetyNotes.some(
      (n) => typeof n === "string" && matchesAny(n, INCOMPLETENESS_DISCLOSURE_PATTERNS) !== null,
    );
    if (!hasIncompletenessNote) {
      errors.push(
        `${idLabel}: empty canonicalMessages requires a safetyNote disclosing the incompleteness (e.g. 'draft', 'awaiting review', 'placeholder')`,
      );
    }
  }

  // Trust-posture rule.
  if (profile?.trustPosture === "high_trust_review_required") {
    if (profile.claimPolicy === "allow_marketing_variants") {
      errors.push(
        `${idLabel}: trustPosture 'high_trust_review_required' forbids claimPolicy 'allow_marketing_variants'`,
      );
    } else if (
      profile.claimPolicy !== "strict_canonical_only" &&
      Array.isArray(profile.safetyNotes)
    ) {
      const hasReviewDisclosure = profile.safetyNotes.some(
        (n) =>
          typeof n === "string" &&
          matchesAny(n, HUMAN_REVIEW_DISCLOSURE_PATTERNS) !== null,
      );
      if (!hasReviewDisclosure) {
        errors.push(
          `${idLabel}: trustPosture 'high_trust_review_required' with claimPolicy '${profile.claimPolicy}' requires a safetyNote disclosing human review`,
        );
      }
    }
  }

  // Energy / motion rule.
  if (
    profile?.energy === "quiet" &&
    profile.motionIntensity === "moderate"
  ) {
    errors.push(
      `${idLabel}: energy 'quiet' forbids motionIntensity 'moderate'`,
    );
  }

  // Density / tone rule.
  if (
    profile?.tone === "calm" &&
    profile.visualDensity === "dense" &&
    Array.isArray(profile.safetyNotes)
  ) {
    const hasDenseJustification = profile.safetyNotes.some(
      (n) =>
        typeof n === "string" &&
        matchesAny(n, DENSE_JUSTIFICATION_PATTERNS) !== null,
    );
    if (!hasDenseJustification) {
      errors.push(
        `${idLabel}: tone 'calm' with visualDensity 'dense' requires a safetyNote that justifies the dense choice (e.g. 'dense layout is intentional')`,
      );
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
