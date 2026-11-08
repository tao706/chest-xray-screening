# Windows安装与引导启动

## 前置环境

Windows x64、Node.js 22.12及以上、Python 3.12、MySQL 8。启动MySQL；确保Python 3.12可由PATH、Python Launcher发现，或设置CHEST_AI_PYTHON。操作系统环境仍需自行安装，引导脚本不会安装系统软件。

## 推荐：引导启动

在项目根目录执行：

```powershell
npm run quickstart
```

首次运行会安装锁定的前后端与Python依赖、构建源码，并提示输入MySQL连接信息和初始管理员账号密码。密码输入隐藏；配置只写入本地server/.env，不上传。接着初始化数据库结构、下载疾病权重及图像准入权重、检查环境并启动浏览器。首次下载依赖和模型可能较慢；GitHub/Hugging Face网络不通时会停止，不使用模拟结果替代。

MySQL账号需要CREATE DATABASE和CREATE TABLE权限，默认数据库chest_xray，也可输入其他合法名称。初始化使用CREATE IF NOT EXISTS，不删除已有表或清空记录；对已有表不做自动迁移，结构冲突需检查后手动处理。若账号没有建库权限，可请数据库管理员按database/schema.sql创建数据库和表，再配置具备所需业务读写权限的应用账号。

访问 http://127.0.0.1:3000 并使用配置的账号登录。停止运行 `npm stop`。再次引导启动会保留已有配置、复用模型和已构建文件。更新代码或依赖后执行npm run setup重新安装构建。两个副本使用相同服务端口，不能同时启动。

## 手动执行与重试

```powershell
npm run setup
npm run configure
npm run db:init
npm run check
npm start
```

setup默认下载两类模型。若只安装构建，可用 `npm run setup -- -SkipModels`，稍后 `npm run models:prepare` 下载。疾病模型约16.4MB，SHA-256校验通过后才替换文件；下载失败保留原文件。图像准入模型约600MB，固定上游版本，已准备的文件复用，启动时实际加载校验。

本地配置存在时configure默认不改写。主动重填用 `npm run configure -- -Force`；它会更新数据库与初始管理员配置，保留助手等其他选项。已有账号密码不会因此重置。实际.env不提交仓库；公开仓库只包含.env.example。

## 可选在线助手

在server/.env填写自己的LLM_API_KEY、LLM_BASE_URL和LLM_MODEL，重启服务。未配置或调用失败时，助手使用本地规则回答。CLINICAL_LLM_ENABLED控制是否向外部语言服务发送临床上下文。详情见LLM_SETUP.md。

## 常见阻塞

| 情况 | 处理 |
| --- | --- |
| 找不到Python 3.12 | 安装3.12，或设置CHEST_AI_PYTHON |
| MySQL连接或权限失败 | 启动MySQL，核对主机端口、凭据和建表权限，再运行npm run db:init |
| GitHub/Hugging Face下载失败 | 检查网络后运行npm run models:prepare，或按MODEL_DOWNLOAD.md手动获取 |
| 模型校验不通过 | 原文件保持不变，重新运行npm run models:prepare，或手动下载后校验 |
| 3000/8000端口占用 | 停止正在运行的项目副本后重试，不自动结束无关进程 |
| 已有表结构不兼容 | 根据错误检查实际表结构，引导脚本不会删除或重建业务表 |

依赖基线为Windows CPU，未声明已验证Linux、macOS或CUDA。不要复制node_modules或Python虚拟环境到新电脑，按锁文件安装。
