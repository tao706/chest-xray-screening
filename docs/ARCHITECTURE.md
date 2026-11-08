# 架构与数据流

## 三个进程的职责

Vue构建产物由Express提供，开发时可使用Vite。浏览器的业务入口为/api；Express处理会话、文件持久化、数据库和任务，FastAPI只负责内部影像分析。

原始图片保存在本地文件目录，元数据、逐类别结果、版本、任务和审阅记录保存在MySQL。Pinia中的当前检查只是前端会话状态，不替代数据库持久化。

## 一次检查

NewStudyView收集编号、备注及File列表，API层以FormData提交。Express验证输入后调用FastAPI，真实权重按检查点参数预处理，按检查级方式聚合多图logits并使用sigmoid得到独立分数，结果由业务层保存并返回。

推理是一次请求中的计算，不是已经实现的分布式异步队列。批量任务是独立的任务处理路径。

## 关注区域

ResultView选择图片与类别后请求Express的gradcam接口。后端检查存储图片和版本，再调用Python梯度计算。解释图是原图与关注区域的可视化，不是框检测结果；旧版检查不允许直接套用新版编号生成解释图。

## 批量任务

服务端扫描本地数据集，创建数据库任务及条目，逐次请求影像服务并更新状态。SSE用于通知进度；前端重新读取任务详情，以数据库状态更新展示。实时连接、进度事件与任务执行并不等于持久化消息队列，进程中断恢复仍需测试。

## 助手

Vue提交问题、有限历史和已选检查上下文。Express查询关联检查，标准化临床选项，识别意图，再用LangChain.js的Document、递归切分器和Runnable编排本地BM25、TF-IDF检索。无向量数据库，也未实现基于向量嵌入的语义检索。

语言服务收到整理后的信息后生成回答，服务端执行规则校验或回退本地回答，然后SSE分段发送。前端用响应式消息对象及requestAnimationFrame缓冲，提供逐步显示、停止、重试和会话恢复。停止前端请求不代表当前实现已保证取消所有上游计算。

## 安全与状态边界

会话Cookie、角色、输入检查和人工审阅是已有措施，不代表行级数据隔离或完成安全审计。自由文本脱敏使用规则处理，不能保证识别所有身份信息。正式公开部署前还需要HTTPS、访问策略、日志审计、恢复演练和压力测试。

## 关键源码入口

| 范围 | 文件 |
| --- | --- |
| 路由与登录守卫 | frontend/src/router/index.ts |
| 认证与当前检查 | frontend/src/state/auth.ts、currentStudy.ts |
| 上传、结果、任务、助手页面 | frontend/src/views/ |
| 聊天分段读取与显示缓冲 | frontend/src/api/assistant.ts、views/streamText.ts |
| 业务HTTP入口 | server/src/app.ts、routes/ |
| 检索及回答 | server/src/services/rag.service.ts、llm.service.ts |
| 内部影像API | inference/main.py |
| 权重加载及预处理 | inference/model_runtime/team_model.py、model_definition.py |
| 类别契约 | inference/model_runtime/classes.py、server/src/constants/classes.ts |
