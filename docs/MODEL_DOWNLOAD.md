# 疾病分类权重下载与校验

## 下载

从 [模型 Release](https://github.com/tao706/chest-xray-screening/releases/tag/model-v1.0.0) 的 Assets 下载 `chest_model.pt` 与 `SHA256SUMS.txt`。仓库为私有时，需要登录有访问权限的GitHub账号；下载链接不绕过仓库权限。

将 `chest_model.pt` 放到项目的 `inference/weights/`，保持文件名不变。不要将这个文件提交到源码Git仓库。

## 校验

文件大小：16,385,831字节。SHA-256：

```text
91fe5a2657f4dbddd7a8a1d162c25f4d873524d6594a5f0c176ae51245004a24
```

在项目根目录运行：

```powershell
$actual = (Get-FileHash -LiteralPath .\inference\weights\chest_model.pt -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne '91fe5a2657f4dbddd7a8a1d162c25f4d873524d6594a5f0c176ae51245004a24') { throw 'Model checksum mismatch' }
npm run check:model
```

自检还需要按安装说明下载图像准入校验模型，并安装Python依赖。

## 两类模型的区别

| 文件 | 用途 | 获取方式 |
| --- | --- | --- |
| inference/weights/chest_model.pt | 14类异常影像评分与Grad-CAM | 本Release下载 |
| inference/weights/image_gate/ | 疾病分析前的图像准入校验 | 按INSTALL_WINDOWS.md运行download-image-gate.py |

图像准入模型约600MB；疾病权重约16.4MB。真实分析仍需要配置数据库、依赖与本地环境；在线助手密钥可选。

## 来源与使用范围

疾病权重由协作者训练并交付，维护者已确认协作者同意公开分发。本次发布未将权重另行指定为MIT，也不自动授予第三方数据或基础模型的额外权利。上游来源与条款核查状态见LICENSING_STATUS.md；模型类别、报告指标与工程验证范围见MODEL_CARD.md。当前用于学习、科研和工程实践，不代表完成临床部署验证。
