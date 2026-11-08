# 当前模型说明

## 接入基准

采用队友交付的xray-project/inference/weights/chest_model.pt。不是依据早期比赛标签进行适配，也没有因提供过Kaggle链接而更换权重或重命名类别。

当前总工程与队友交付权重的SHA-256完全一致：

`91fe5a2657f4dbddd7a8a1d162c25f4d873524d6594a5f0c176ae51245004a24`

## 文件记录

检查点版本nih14-efficientnet-b0-v1，架构EfficientNet-B0，输入224像素。配套代码按检查点中的均值、标准差与聚合方式处理，灰度转RGB，等比缩放填充后计算多标签分数。类别顺序在加载时核对，不允许只改页面名称来适配其他权重。

## 输出顺序

| 编号 | 中文 | 检查点标签 |
| --- | --- | --- |
| 1 | 肺不张 | Atelectasis |
| 2 | 心影扩大 | Cardiomegaly |
| 3 | 肺部实变 | Consolidation |
| 4 | 肺水肿 | Edema |
| 5 | 胸腔积液 | Effusion |
| 6 | 肺气肿 | Emphysema |
| 7 | 肺纤维化 | Fibrosis |
| 8 | 膈疝 | Hernia |
| 9 | 肺浸润 | Infiltration |
| 10 | 肺部肿块 | Mass |
| 11 | 肺结节 | Nodule |
| 12 | 胸膜增厚 | Pleural_Thickening |
| 13 | 肺炎 | Pneumonia |
| 14 | 气胸 | Pneumothorax |

这套标签不含No Finding。所有分数低于显示阈值不代表正常。Grad-CAM只表示网络关注区域，不是经过病灶框监督验证的检测结果。

## 来源与授权状态

权重由队友训练并交付。文件版本和测试报告记录指向NIH14；实际训练数据、标签加工和划分来源尚待训练方材料确认。此前提到的Kaggle VinBigData链接不作为当前权重已确认的数据来源。

项目实现可以继续完善，训练与适配代码已由维护者确认同意MIT公开。权重和图片暂不纳入公开仓库。发布权重前需确认训练方同意、训练代码和预训练权重来源，以及数据条款对拟发布方式的要求。业务项目不再以比赛规则作为设计依据。

## 已知评估范围

附带报告测试macro AUC约0.651、macro F1约0.176。这是交付文件报告，尚未经独立复现实验。当前工程测试证明真实后端可返回14项结果和Grad-CAM，不证明临床有效性。


图像准入模块另用 openai/clip-vit-base-patch32（固定版本3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268）。来源：https://huggingface.co/openai/clip-vit-base-patch32 。原始实现及许可：https://github.com/openai/CLIP 。预训练文件单独下载，不随项目源码分发，不因项目MIT许可而改变原始许可。它是通用研究模型，不能替代经过验证的胸片模态分类器；见 INPUT_VALIDATION.md。


## 权重公开同意记录（2026-11-07）

项目维护者已确认，队友同意公开交付的chest_model.pt。此记录表示训练方已同意公开，不表示已选择权重许可证，也不替代实际训练数据及基础预训练权重的适用条款核查。对应SHA-256：91fe5a2657f4dbddd7a8a1d162c25f4d873524d6594a5f0c176ae51245004a24。拟在上游条款与权重许可明确后作为独立下载附件提供，不纳入源码仓库；目前尚未上传。
