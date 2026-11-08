# Windows可复现安装

## 支持范围

本流程面向Windows x64、Node.js 22.12及以上、Python 3.12和本机MySQL 8。当前依赖锁定以Windows CPU推理为验收基线，不声明已经验证Linux、macOS或CUDA。

## 准备

安装Node.js、Python 3.12与MySQL。确保python命令指向3.12，或在PowerShell使用 `$env:CHEST_AI_PYTHON = '<Python 3.12可执行文件路径>'`。无需安装任何AI编程工具。

项目必须位于可写目录。不要复制node_modules或虚拟环境到新电脑。安装器使用inference/.venv312，现有旧版.venv和.python_packages保留但不再参与运行。

## 安装

在根目录执行 `npm run setup`。安装器执行前后端npm ci，在inference/.venv312创建Python 3.12环境，根据requirements-win-cpu.lock.txt安装CPU依赖，执行pip check和导入检查，再构建项目。

已有环境配置不会被覆盖。缺少server/.env或inference/.env时才从示例创建。不得将实际.env提交到仓库。

## 配置数据库

以数据库管理员身份执行database/schema.sql。然后在server/.env设置DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME及AUTH_DEMO_PASSWORD。建议使用专门的应用数据库账号。schema.sql是结构初始化，不是患者数据导入文件。

首次启动会创建配置指定的管理员。已有账号密码不会随环境配置修改自动重置。

## 单独提供权重

公开仓库不包含chest_model.pt；examples/chest-xrays随附两张CC0胸片。取得相应权限后将队友交付权重放入inference/weights/chest_model.pt。核对MODEL_CARD.md中的SHA-256。inference/.env配置pytorch、224像素及正确的权重路径。

缺少权重时应看到明确错误，不能以模拟输出代替。模型自检默认使用随附的CC0样例；接口验收仍需要另外配置本地批量验收数据，不能仅凭npm setup成功认定全链路已验收。

## 运行

`npm run check` 检查配置、端口、依赖和权重。
`npm start` 启动服务，访问 http://127.0.0.1:3000 。
`npm stop` 停止本项目记录的进程。

两个项目副本使用同一默认端口，不能同时启动。端口占用时先停止正在运行的副本；不要将一个副本的.runtime复制到另一个。

## 依赖锁

npm锁文件和requirements-win-cpu.lock.txt用于复现测试环境。Python锁文件是版本锁，不是带哈希的供应链校验清单。升级时在独立环境重新安装、运行pip check和推理测试后更新，不要在运行中的环境直接升级。


## 本地图像准入校验

安装依赖后、首次启动前在项目根目录执行：

```powershell
& .\inference\.venv312\Scripts\python.exe .\scripts\download-image-gate.py
```

这会下载固定版本的图像语义校验权重（约600MB）。运行时完全从本地加载，不上传图片。该目录不包含在公开源码包中。缺少或加载失败时不能开始分析，不能绕过。实现、阈值和验证局限见 [INPUT_VALIDATION.md](INPUT_VALIDATION.md)。
