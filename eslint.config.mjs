import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Phase 1 server-boundary enforcement. Client components in
  // `src/components/**` (currently every file there is `"use client"` or a
  // plain UI component) must not import from `@/server/**`. The
  // service-role Supabase client, analytics writer, admin auth,
  // actor resolver, and intent command runner all live there;
  // importing them from a client component would risk pulling
  // those paths into the browser bundle.
  //
  // Server actions (`"use server"` modules) and any future
  // shared-server entry points are reached through a *client
  // adapter* under `@/lib/client/**` — see
  // `src/lib/client/chatIntakeClient.ts`. The adapter is the single
  // seam that decides between local-demo and shared-server modes;
  // a blanket ban here keeps that contract honest.
  //
  // Server components under `src/app/**` may still import
  // `@/server/**` freely — App Router server components are always
  // server-evaluated.
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
                "Client components must not import from @/server/**. Server-only modules (Supabase service-role client, analytics writer, admin auth, actor resolver, intent runner) and server actions are reached through the client adapter at @/lib/client/**. See docs/phase1_validation_beta_plan.md and docs/corent_security_review_phase1_2026-04-30.md.",
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
