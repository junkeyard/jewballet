import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// ESLint 기본 + TypeScript + React 훅 규칙.
// eslint-config-next는 쓰지 않는다: 그 안의 @next/eslint-plugin-next가 fast-glob → braces를 끌고 오는데,
// braces에 고친 버전이 없는 고위험 취약점(GHSA-vfj7-8cjw-p6xm)이 있어 `npm audit` 고위험 0건 조건을 깨기 때문이다.
// 고친 버전이 나오면 eslint-config-next로 돌아가도 된다.

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**", ".testdb/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", Buffer: "readonly", URL: "readonly", setTimeout: "readonly", fetch: "readonly" } },
  },
  // Playwright 픽스처의 use()는 React 훅이 아니다. 빈 구조분해({})는 Playwright 픽스처 문법이다.
  { files: ["e2e/**"], rules: { "react-hooks/rules-of-hooks": "off", "no-empty-pattern": "off" } },
);
