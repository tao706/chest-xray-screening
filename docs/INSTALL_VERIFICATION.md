# 隔离安装验证记录

日期：2026-11-07。

## 已执行

- 使用独立工作目录，不复制现成node_modules，分别执行前后端npm ci。
- 独立前端执行vue-tsc与Vite构建通过，独立后端TypeScript构建通过。
- 无注释主工程新建Python 3.12环境inference/.venv312，从包索引安装CPU推理依赖，没有引用.python_packages。
- pip check通过，实际依赖版本写入requirements-win-cpu.lock.txt。
- 主工程使用新环境完成14类真实权重自检，评分范围与真实Grad-CAM检查通过。
- 主工程前后端和Python语法构建通过，发布候选内容检查通过。

## 本次整改

补齐Pinia清单及锁文件。运行脚本改为项目Python 3.12虚拟环境，不再依赖编程工具缓存；清除继承的PYTHONPATH以避免依赖串用。setup安装完整锁定依赖并验证导入，不再只安装Web框架。配置示例仅在本地配置缺失时复制。

## 验证边界

这是同一台Windows机器中的隔离依赖验证，不是独立操作系统镜像中的全新机器验证。本次没有新建MySQL实例、执行数据库迁移或重新进行所有接口验收。安装器各关键操作经过验证，但没有对正在运行项目直接重跑npm setup覆盖其node_modules。

Windows CPU依赖锁为版本固定，未包含包哈希。Linux、macOS、CUDA和Docker尚未验证，不能据此声称跨平台部署完成。权重与样例数据仍需分别取得使用及分发权限。
