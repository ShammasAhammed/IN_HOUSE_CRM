import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ---------------------------------------------------------------------------
// Architecture boundaries (see CLAUDE.md). These make the layering mechanical:
// a violation fails `npm run lint`, so it fails `npm run check`.
// ---------------------------------------------------------------------------

// Database, storage and third-party API clients: only adapters/ (and db/ for schema) may import them.
// Regexes match whole package names, so "@/adapters/postgres" is not mistaken for the "postgres" package.
const infraPattern = {
  regex:
    "^(drizzle-orm|drizzle-kit|postgres|pg|googleapis|firebase|firebase-admin|openai|resend)(/.*)?$|^@(googleapis|google-cloud|aws-sdk|sentry|anthropic-ai)/",
  message:
    "Database, storage and API clients may only be imported inside adapters/ (see CLAUDE.md, architecture rule).",
};
const dbPattern = {
  regex: "^@/db(/|$)|(^|/)db/schema",
  message: "The db/ schema may only be imported inside adapters/ and db/.",
};
const adaptersPattern = {
  regex: "^@/adapters(/|$)|(^|/)adapters(/|$)",
  message: "Only lib/server/container.ts may import adapters/. Get services from the container instead.",
};
const frameworkPattern = {
  regex: "^(next|next-auth|react|react-dom)(/.*)?$|^@/(app|components)(/|$)",
  message: "services/ and repositories/ must stay framework-free: no Next.js, React or UI imports.",
};
const servicesFromRepoPattern = {
  regex: "^@/services(/|$)|(^|/)services(/|$)",
  message: "repositories/ holds interfaces only and must not depend on services/.",
};
const firebasePattern = {
  regex: "^(firebase|firebase-admin)(/.*)?$",
  message: "Firebase may only be used by adapters/crm (reading the existing CRM). Never as our database.",
};

const restrict = (...patterns) => ["error", { patterns }];

// Google, Meta, Zoho (and Anthropic) APIs are called with fetch, which no import rule sees: their URLs belong in adapters/ only.
const apiUrl = "/(googleapis\\.com|graph\\.facebook\\.com|zohoapis\\.(com|in)|api\\.anthropic\\.com)/";
const apiUrlRule = [
  "error",
  { selector: `Literal[value=${apiUrl}]`, message: "Call Google, Meta or Zoho only from their adapter in adapters/ (CLAUDE.md)." },
  { selector: `TemplateElement[value.raw=${apiUrl}]`, message: "Call Google, Meta or Zoho only from their adapter in adapters/ (CLAUDE.md)." },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "db/migrations/**"]),

  // Default for every file: no infra clients, no db schema, no adapters.
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    rules: { "no-restricted-imports": restrict(infraPattern, dbPattern, adaptersPattern), "no-restricted-syntax": apiUrlRule },
  },
  // services/: also framework-free.
  {
    files: ["services/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": restrict(infraPattern, dbPattern, adaptersPattern, frameworkPattern) },
  },
  // repositories/: interfaces only — framework-free and no services.
  {
    files: ["repositories/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrict(
        infraPattern,
        dbPattern,
        adaptersPattern,
        frameworkPattern,
        servicesFromRepoPattern,
      ),
    },
  },
  // The one composition root may wire adapters into services.
  {
    files: ["lib/server/container.ts"],
    rules: { "no-restricted-imports": restrict(infraPattern, dbPattern) },
  },
  // Adapters, schema, migrations scripts and tests may use infrastructure directly.
  {
    files: ["adapters/**/*.{ts,tsx}", "db/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "drizzle.config.ts"],
    rules: { "no-restricted-imports": "off", "no-restricted-syntax": "off" },
  },
  // The CRM is read from Firestore, but only by its own adapter. Nowhere else may touch Firebase.
  {
    files: ["adapters/**/*.{ts,tsx}"],
    ignores: ["adapters/crm/**"],
    rules: { "no-restricted-imports": restrict(firebasePattern) },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
]);

export default eslintConfig;
