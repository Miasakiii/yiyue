// 最小 lint 层：TypeScript + React 基础规则 + 项目前端约定的可执行化（AGENTS.md「前端约定」）
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

// AGENTS.md 约定 1：颜色一律 var(--*) 令牌，禁止硬编码色值（hex / rgb / hsl）
const HEX_COLOR = "#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b";
const FUNC_COLOR = "\\b(?:rgb|hsl)a?\\(";
const COLOR_MSG =
  "禁止硬编码色值，请使用 var(--*) 颜色令牌（见 AGENTS.md 前端约定）。确属数据/外部约束的例外需 eslint-disable 并注明原因。";

// AGENTS.md 约定 2：hover 一律用 CSS 类（hover-bg 等），禁止 JS onMouseEnter/onMouseLeave 做 hover 样式
const HOVER_MSG =
  "hover 样式禁止用 JS onMouseEnter/onMouseLeave，请改用 CSS 类（hover-bg 等，见 AGENTS.md）。非样式用途（拖拽、状态复位等）需 eslint-disable 并注明原因。";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "node_modules.bak/**",
      "src-tauri/**",
      ".qoder/**",
      ".ralph/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // React 规则
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "warn",
      // 基线降噪：先以 warn 记录，后续再收紧
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // 项目前端约定（可执行化）
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${HEX_COLOR}/]`,
          message: COLOR_MSG,
        },
        {
          selector: `TemplateElement[value.raw=/${HEX_COLOR}/]`,
          message: COLOR_MSG,
        },
        {
          selector: `Literal[value=/${FUNC_COLOR}/]`,
          message: COLOR_MSG,
        },
        {
          selector: `TemplateElement[value.raw=/${FUNC_COLOR}/]`,
          message: COLOR_MSG,
        },
        {
          selector: 'JSXAttribute[name.name="onMouseEnter"]',
          message: HOVER_MSG,
        },
        {
          selector: 'JSXAttribute[name.name="onMouseLeave"]',
          message: HOVER_MSG,
        },
      ],
    },
  },
);
