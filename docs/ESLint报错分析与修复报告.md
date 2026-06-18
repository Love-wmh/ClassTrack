# ESLint pre-commit 报错分析与修复报告

## 一、现象

执行 `git commit` 时，husky 的 pre-commit 钩子运行 `pnpm lint-staged`，其中 `eslint --fix` 任务失败，提交被中断：

```
✖ eslint --fix:
(node:10657) ESLintIgnoreWarning: The ".eslintignore" file is no longer supported.
Switch to using the "ignores" property in "eslint.config.js"

ESLint: 10.4.0
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
From ESLint v9.0.0, the default configuration file is now eslint.config.js.
husky - pre-commit script failed (code 1)
```

## 二、根本原因

报错由两个层面叠加导致：

### 1. 配置格式与 ESLint 版本不兼容（直接原因）

- 项目当前安装的 ESLint 版本为 **10.4.0**（`node_modules/.pnpm/eslint@10.4.0`）。
- 从 **ESLint v9.0.0** 起，默认配置文件改为 **flat config**（`eslint.config.js`），不再默认读取旧的 `.eslintrc.*`。
- 同时 `.eslintignore` 文件也已被废弃，需用 flat config 里的 `ignores` 字段替代。
- 而项目里仍是旧格式的 `.eslintrc.cjs` + `.eslintignore`，ESLint 找不到 `eslint.config.js`，直接报错退出。

证据：
- 仓库根目录存在 `.eslintrc.cjs`、`.eslintignore`，不存在 `eslint.config.js`。
- `package.json` 中 lint 脚本仍使用 flat config 已移除的 `--ext` 参数：
  - `"lint": "eslint . --ext ts,tsx ..."`
  - `"lint:fix": "eslint . --ext ts,tsx --fix"`

### 2. 迁移成果被 `git reset --hard` 回退（触发原因）

终端记录显示，提交前执行过：

```
git reset --hard
HEAD is now at 8319bba chore: 配置了提交信息校验
```

此前已完成的 flat config 迁移（新增 `eslint.config.js`、删除旧配置、并通过 `pnpm add -D` 引入 `typescript-eslint`、`globals`、`@eslint/js`）属于**未提交的工作区改动**，`git reset --hard` 将其全部丢弃，工作区回到旧状态：

- `eslint.config.js` 被删除，`.eslintrc.cjs` / `.eslintignore` 恢复。
- `package.json` 中 lint 脚本恢复为带 `--ext` 的旧写法。
- 终端输出 `Packages: -13 ... - @eslint/js / - globals / - typescript-eslint` 也印证 `pnpm install` 把新增依赖移除了。

因此问题与第一次迁移前完全一致，并非新问题。

## 三、修复方案

将 ESLint 配置迁移到 flat config 新格式，与已安装的 ESLint 10.x 对齐。

### 1. 新建 `eslint.config.js`

要点：
- 用 `ignores` 字段替代 `.eslintignore`。
- 用 `js.configs.recommended`、`typescript-eslint`、`eslint-plugin-react` 的 flat config、`react-hooks`、`react-refresh`、`prettier` 组合。
- `eslint-plugin-react` 在 ESLint 10 下 `version: 'detect'` 会触发 `getFilename is not a function` 报错，需显式指定 `react.version`（如 `'19'`）。
- 为 `*.cjs` 文件单独配置 `sourceType: 'commonjs'` 与 node globals，避免 `commitlint.config.cjs` 报 `'module' is not defined`。

### 2. 删除旧配置文件

- 删除 `.eslintrc.cjs`
- 删除 `.eslintignore`

### 3. 修改 `package.json` 脚本

flat config 不再支持 `--ext`，移除该参数：

- `"lint": "eslint . --report-unused-disable-directives --max-warnings 0"`
- `"lint:fix": "eslint . --fix"`

### 4. 补充缺失依赖

flat config 需要以下包：

```bash
pnpm add -D typescript-eslint globals @eslint/js
```

### 5. 验证

```bash
pnpm lint
```

确认 ESLint 能正常加载配置并运行（不再报 "couldn't find eslint.config" 与 ".eslintignore no longer supported"）。

## 四、注意事项

- 本次问题的诱因是 `git reset --hard` 丢弃了未提交的迁移改动。**重做迁移后应立即 `git add` 并提交**，避免再次被重置丢失。
- 迁移完成后 `pnpm lint` 可能仍暴露真实的代码告警/错误（如 `react-hooks/set-state-in-effect`、`no-explicit-any`），这些属于代码本身问题，与配置迁移无关，可单独修复。
