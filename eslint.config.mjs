import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Phase 1 server-boundary enforcement. Client components in
  // `src/components/**` (currently every file there is `"use client"` or a
  // plain UI component) must not import server-only modules. The admin
  // Supabase client and analytics writer live under `@/server/**` and ship
  // the service-role key path; importing them from a client component
  // would risk pulling that path into the browser bundle.
  //
  // Server components under `src/app/**` may still import `@/server/**`
  // freely — App Router server components are always server-evaluated.
  {
    files: ["src/components/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*", "@/server/**"],
              message:
                "Client components must not import from @/server/**. Server-only modules (Supabase service-role client, analytics writer, admin auth) must be reached via a server component or route handler. See docs/phase1_validation_beta_plan.md and docs/corent_security_review_phase1_2026-04-30.md.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Pre-existing: a design doc was misnamed `docs/eslint.config.mjs` and
    // must not be parsed by ESLint. Tracked in the implementation note.
    "docs/**",
  ]),
]);

export default eslintConfig;
