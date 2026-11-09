# 在线演示部署准备

当前已准备Linux Docker Compose配置，尚无已上线的演示网址。不要将Windows虚拟环境、实际.env或本地数据库复制到服务器。

## 组成与隔离

Compose包含Caddy、Node.js业务与静态页面、Python CPU分析服务、MySQL，以及模型准备和演示账号初始化任务。仅Caddy的80/443端口对外；MySQL、Python和Node端口不映射到宿主机。Caddy在域名与网络条件具备时申请HTTPS证书，并即时转发SSE数据。

使用独立的demo_database、demo_models、demo_uploads、demo_exports等命名卷，不挂载本地业务库与上传目录。首次模型准备任务下载疾病权重并核对SHA-256，再下载固定版本的图像准入模型。常驻分析容器只读挂载权重。

## 演示边界

- 演示账号为demo，密码由维护者生成，角色为操作员；owner管理员密码不要对外提供。
- 上传仅接受项目随附两张公开胸片的原始字节，修改、截图或其他图片会拒绝。页面提供下载入口，仍执行真实胸片分析，不返回模拟疾病评分。
- 访客共用演示数据库，可以看到其他访客基于公开样例生成的记录。它不是多租户或个人数据隔离系统，不要填写身份信息。
- 禁止注册、删除、批量任务与审阅草稿保存。浏览、样例分析、关注区域和对话可用。
- 单IP每分钟120次API访问；昂贵操作单IP每小时30次、全局每小时120次；Node单进程最多处理一个昂贵请求，Python工作线程也限制为一个模型计算。
- 演示检查达到200条后拒绝继续创建；维护者需要安排清理或重新准备专用演示数据。限额为单进程内存窗口，重启会重置；不是分布式防滥用系统。
- 默认不开在线语言服务密钥，也不向外部服务发送临床上下文；可选择配置自己的密钥。真实外部语言服务会产生相应调用成本。

这些限制仅在DEMO_MODE=true启用。Windows本地完整模式不默认启用。

## 购买服务器前

先通过容器构建和测试，后续再按实际CPU延迟、内存与磁盘使用确定服务器规格。当前没有购买服务器、注册域名或实际压测。配置以Linux x86_64和CPU为目标，不包含GPU与ARM验收。

## 将来上云步骤

1. 准备Linux主机、Docker Engine与Compose，以及一个解析到该主机的域名。主机80/443需可访问，SSH按你的访问方式单独管理。
2. 克隆本仓库。已有Node.js的机器可执行 `node deploy/configure.mjs 你的真实域名`，创建deploy/.env。没有Node.js时可先在本机生成，再通过自己的安全方式传到服务器；不要上传到Git。
3. deploy/.env已生成独立数据库、owner与demo密码；需要时手动填写LLM_API_KEY。该文件不可公开。不要使用.env.example里的占位密码。
4. 在项目根目录执行：

```bash
docker compose --env-file deploy/.env config --quiet
docker compose --env-file deploy/.env up -d --build
docker compose --env-file deploy/.env ps -a
docker compose --env-file deploy/.env logs --tail=100 models inference demo-init web proxy
```

首次镜像构建和依赖、模型下载可能较慢。models和demo-init完成后以退出码0结束属于正常状态，其他服务应达到healthy或running。若准备模型失败，修复网络后运行：

```bash
docker compose --env-file deploy/.env up -d --build
```

5. 打开配置的HTTPS域名，使用demo账号和deploy/.env中的DEMO_PASSWORD登录；下载页面样例并上传，测试真实分析、缩放、关注区域、对话，以及被禁用操作的提示。
6. 用未登录浏览器验证不能访问业务接口。检查只有80/443公开；不要把数据库或推理端口暴露出来。确认访问、资源占用和限额后，再把演示网址加入README。

只停止服务而保留数据：

```bash
docker compose --env-file deploy/.env down
```

不要随意加-v，它会删除命名卷中的数据。更新代码后重新构建并验证；更改MySQL初始化密码不会自动修改已有卷中的数据库密码。

## 验证范围

本机当前没有Docker引擎，所以不能把静态配置检查说成已完成整套容器运行。CI新增Linux容器构建、Python导入、演示策略、MySQL初始化任务等检查；实际结果以对应提交的Actions为准。未完成真实域名证书签发、服务器重启恢复、端到端公网推理和负载测试。

## 官方参考

- https://docs.docker.com/compose/how-tos/production/
- https://docs.docker.com/compose/how-tos/startup-order/
- https://caddyserver.com/docs/automatic-https
- https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
