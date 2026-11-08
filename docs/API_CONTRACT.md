# 前后端接口约定

## 服务地址

- Vue 开发服务：`http://127.0.0.1:5173`
- Express 业务服务：`http://127.0.0.1:3000`
- FastAPI 内部推理服务：`http://127.0.0.1:8000`

浏览器只访问 `/api`，不直接访问 FastAPI。

除健康检查、登录和注册相关接口外，所有Express业务接口都要求有效的HttpOnly会话Cookie。未登录或会话过期返回HTTP 401。

## 登录与会话

- `POST /api/auth/login`：验证用户名和密码，成功后设置HttpOnly、SameSite=Lax会话Cookie。
- `GET /api/auth/registration`：查询当前是否开放自主注册。
- `POST /api/auth/register`：注册操作员账号，成功后设置会话Cookie。用户名须为3至50位字母、数字、下划线或连字符；密码须为10至128位且包含字母和数字。可通过 `AUTH_ALLOW_REGISTRATION` 关闭。
- `GET /api/auth/me`：恢复当前登录用户。
- `POST /api/auth/logout`：删除服务端会话并清除Cookie。

密码使用Node.js内置scrypt加盐哈希，数据库不保存明文密码；会话只保存令牌的SHA-256摘要。默认会话有效期为8小时。接口对同一IP和用户名连续登录失败进行限制。
注册接口另对同一IP设置10分钟内最多5次尝试的限制。新注册操作员可访问共享工作区内已有检查，请仅向获授权人员开放。

## 健康检查

`GET /api/health`

返回 Express、MySQL 和 FastAPI 的状态。任意核心服务不可用时返回 HTTP 503。
同时返回 MySQL/FastAPI 响应耗时、Express 运行时长、Node.js 版本、模型版本、运行设备和统一检测时间，供启动检测、首页服务摘要和内部故障定位使用。

## 首页统计

`GET /api/dashboard`

返回累计检查数、今日检查数、成功率、平均模型耗时、近30天各类别达到0.5阈值的次数、近7天每日检查量、最近5条检查和最近5个批量任务。所有统计均来自MySQL真实记录。

## 类别

`GET /api/classes`

返回当前权重对应的14个类别，编号1至14，详见MODEL_CARD.md。

## 创建并推理检查

`POST /api/studies/predict`

请求类型：`multipart/form-data`

字段：

- `subject_id`：1～64 位字符串，只允许字母、数字、下划线和短横线。
- `study_id`：1～64 位字符串，只允许字母、数字、下划线和短横线。
- `note`：可选，最多 300 字符。
- `images`：1～20 张 JPG/JPEG/PNG，单张不超过 10MB。

成功返回：

```json
{
  "success": true,
  "data": {
    "database_id": 1,
    "subject_id": "SUB-00001",
    "study_id": "ST-20261009-00001",
    "model_version": "nih14-efficientnet-b0-v1",
    "inference_time_ms": 64.914,
    "total_time_ms": 120.5,
    "image_count": 1,
    "predictions": [{ "class_id": 1, "class_name": "肺不张", "class_name_en": "Atelectasis", "probability": 0.42 }]
  },
  "message": "推理完成并已保存"
}
```

上例只展示一个评分条目以说明字段结构，真实新检查应包含完整14项，示例分数不代表真实推理结果。

## 检查列表

`GET /api/studies`

支持subject_id、study_id、status、page和page_size筛选与分页。返回记录列表及总数，具体字段以当前接口响应为准。

## 检查详情

`GET /api/studies/:studyId`

返回检查元数据和 当前检查所保存类别的完整概率。

## FastAPI 内部接口

- `GET /internal/health`
- `GET /internal/model-contract`：返回当前后端、当前14类顺序和输入约束。
- `POST /internal/predict`
- `POST /internal/gradcam`：接收单张图片和 `class_id`，返回 Base64 热力图及 `is_mock` 标志。

FastAPI 接口由 Express 调用，不对浏览器直接开放。

正式模型通过 `inference/model_runtime/team_model.py` 接入，HTTP层及响应结构不变。`MODEL_BACKEND=mock` 使用联调模型；`MODEL_BACKEND=pytorch` 使用队友实现和 `inference/weights/` 中的正式权重。正式模式下缺少权重、未完成实现、输出概率不符合契约时，服务必须明确失败，不能自动退回模拟模型。

## 检查图片与解释图

- `GET /api/studies/:studyId/images/:imageId`：读取已持久化的检查图片。
- `GET /api/studies/:studyId/gradcam?image_id=1&class_id=9`：为指定图片和类别生成Grad-CAM兼容解释图。

当前pytorch后端生成真实Grad-CAM，返回is_mock=false。关注区域不是病灶检测框；历史检查的类别版本不匹配时返回409，不能直接套用新版类别编号。

## 批量数据集

- `GET /api/tasks/datasets`：列出 `datasets/` 下可用数据集。
- `GET /api/tasks/datasets/:name/scan`：扫描 Study 和图片数量。

目录格式：

```text
datasets/
└─ 数据集名称/
   └─ images/
      └─ subject_00001/
         └─ study_00001/
            ├─ image_000001.jpg
            └─ image_000002.jpg
```

## 批量任务

- `POST /api/tasks`：创建并启动批量任务。
- `GET /api/tasks`：获取最近任务。
- `GET /api/tasks/:taskId`：获取任务状态。
- `GET /api/tasks/:taskId/events`：通过 SSE 接收实时进度。

创建任务请求：

```json
{
  "task_name": "测试集第一轮推理",
  "dataset_name": "test",
  "threshold": 0.5
}
```

## CSV结果导出

- `POST /api/tasks/:taskId/submission`：为已完成任务生成并立即校验 `submission.csv`。
- `GET /api/tasks/:taskId/submission/validate`：重新校验已有文件。
- `GET /api/tasks/:taskId/submission/download`：下载校验后的文件。

生成请求可传新的阈值：

```json
{ "threshold": 0.5 }
```

文件使用 UTF-8 编码，字段及顺序固定为：

```csv
Subject_id,Study_id,Predict_class,Probability
```

生成器会检查类别 ID 为 1～14、概率在 0～1、无空值、无重复的 `Study_id + Predict_class`，并核对批量任务中的 Study 覆盖率。若某个 Study 没有类别达到阈值，会补入该 Study 概率最高的类别，并在校验报告中记录补位数量。存在推理失败的 Study 时校验不通过。

## 智能助手

`POST /api/assistant/chat`

请求：

```json
{ "message": "如何生成submission.csv？" }
```

响应类型为 `text/event-stream`，按顺序可能返回：

- `status`：检索或生成阶段。
- `meta`：请求ID、回答模式和检索来源。
- `token`：流式文字片段。
- `done`：回答完成。
- `error`：流式处理失败。

当前使用本地Markdown资料、LangChain.js和BM25/TF-IDF检索。可选外部语言服务，未配置或失败时回退本地。先生成并校验完整回答，再SSE分段发送；前端平滑显示不等于上游token实时透传。详见LLM_SETUP.md。



## 批量任务删除

DELETE /api/tasks/:taskId删除单个可删除任务；DELETE /api/tasks接收task_ids数组批量删除。进行中的任务不可删除，任务删除不等同于删除已保存的检查记录。


## 影像初检

POST /api/studies/validate-image接收multipart images，不保存图片和检查。未通过返回422及INVALID_CHEST_IMAGE。单次推理、批量和Grad-CAM入口独立执行服务端校验；初检通过不等于经验证的胸片识别。详见INPUT_VALIDATION.md。
