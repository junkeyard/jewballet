import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// Next 공식 규칙(core-web-vitals + typescript)만 쓴다.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**", ".testdb/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Playwright 픽스처의 use()는 React 훅이 아니다.
  { files: ["e2e/**"], rules: { "react-hooks/rules-of-hooks": "off" } },
];

export default config;
