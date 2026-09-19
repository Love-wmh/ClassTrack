// 提交信息规范：Conventional Commits + 「主题必须用中文写」。
//
// 中文限制由本文件里的本地插件实现（commitlint 支持内联插件），而不是靠约定或文档：
//   - 本地：husky 的 commit-msg hook 会在每次 git commit 时调 `pnpm commitlint --edit`
//   - CI：`.github/workflows/ci.yml` 的 commitlint job 检查 PR 的全部提交，因此 `--no-verify` 绕不过去
//
// 只约束「主题」与「正文」的语言：`type(scope):` 前缀保持英文（type 必须是本文件 type-enum 里的枚举值，
// scope 用 `widget`、`android`、`import` 这类英文标识），因为它同时被工具链与人工检索依赖。
//
// 历史提醒：2026-09-20 之前的提交信息是英文的，规则从该日之后生效，不回改历史。
const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        /**
         * 主题必须包含中文。
         *
         * @param {object} parsed commitlint 解析出的提交信息。
         * @param {string} when `always` / `never`。
         * @returns {[boolean, string]} 是否通过 + 失败提示。
         */
        'subject-chinese': (parsed, when) => {
          const matched = CJK_PATTERN.test(parsed.subject ?? '')
          return [when === 'never' ? !matched : matched, '主题必须用中文写，例如：fix(widget): 修掉点卡片打不开 App']
        },
        /**
         * 正文（若有）应当包含中文。
         *
         * 只作为警告：写 `Refs: #12` 这类纯英文脚注是合理用法，不该因此拦下提交。
         *
         * @param {object} parsed commitlint 解析出的提交信息。
         * @param {string} when `always` / `never`。
         * @returns {[boolean, string]} 是否通过 + 提示。
         */
        'body-chinese': (parsed, when) => {
          const body = (parsed.body ?? '').trim()
          if (body === '') return [true]
          const matched = CJK_PATTERN.test(body)
          return [when === 'never' ? !matched : matched, '提交信息正文建议也用中文写（此项为警告）']
        },
      },
    },
  ],
  rules: {
    'type-enum': [2, 'always', ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test']],
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
    'subject-chinese': [2, 'always'],
    'body-chinese': [1, 'always'],
  },
}
