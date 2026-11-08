# 持续集成

## 工作流

.github/workflows/ci.yml配置GitHub Actions，在push、pull_request和手动触发时运行。工作流只申请contents: read权限，同一分支的新提交会取消旧检查，不执行部署、上传权重或发布版本。

| 检查 | 环境 | 内容 |
| --- | --- | --- |
| Web | Windows，Node.js 22和24 | 独立npm ci、Vue类型检查与构建、后端类型检查与构建 |
| Python | Windows，Python 3.12 CPU | 锁定依赖安装、pip check、语法、应用导入与契约测试 |
| 发布文件 | Windows，Node.js 24 | 源码候选检查、Git已跟踪路径检查 |

缓存只使用包管理器下载缓存，不把node_modules、虚拟环境、配置、数据和权重作为工作流产物。工作流无需配置Secrets。

## 无私有数据的Python测试

ci-model-contract.py验证Python与业务层14类编号和名称一致、拒绝错误数量及非有限分数、边界分数合法、FastAPI和推理依赖可导入、缺权重时明确失败。不会加载真实权重，不下载图片，也不把模拟推理成功当作真实验收。

## 本地对应命令

```powershell
npm --prefix frontend ci
npm --prefix server ci
npm --prefix frontend run build
npm --prefix server run typecheck
npm --prefix server run build
inference/.venv312/Scripts/python.exe -m pip check
inference/.venv312/Scripts/python.exe scripts/ci-model-contract.py
npm run check:release
node scripts/ci-source-hygiene.mjs
```

最后一个命令需要Git仓库，只检查git ls-files列出的路径。尚未初始化仓库时会明确失败；它不初始化仓库，不检查未跟踪的本地业务目录。即使文件在.gitignore内，只要被强制跟踪，仍会拦截。

## GitHub启用

只有代码上传到GitHub后，才会有真实的云端运行结果。当前配置及本地检查通过不代表GitHub已经执行过。发布仓库后，在Actions查看首次运行并修复环境差异，再按实际状态检查名称配置受保护分支或ruleset。

未添加虚假的通过徽章，也未替用户创建远程仓库或开启分支保护。

## 边界

CI不包含MySQL实例、真实权重推理、权重、端到端浏览器测试、临床评估、完整秘密扫描或漏洞审计。npm ci的audit关闭以减少不相关网络请求，这不代表没有安全漏洞。真实模型自检和本地接口验收仍需单独执行。

官方配置参考：https://github.com/actions/setup-node 和 https://github.com/actions/setup-python 。GitHub托管环境、网络和免费额度均以实际账号和平台规则为准。

## 本地验证记录（2026-11-07）

前端生产构建、后端类型检查与构建、5项Python契约测试通过。YAML结构及两版关键文件一致性检查通过。临时Git仓库验证：仅跟踪普通源码时通过，强制跟踪测试.env时被拒绝。发布候选扫描通过。

这些结果来自本机Node.js 24与Python 3.12，不代表Node.js 22或GitHub托管runner已经实际运行。Node.js 22的执行结果需在首次云端工作流中确认。
