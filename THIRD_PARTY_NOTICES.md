# 第三方依赖与来源记录

本文件和dependency-licenses.json根据本地锁文件及Python安装元数据生成，属于依赖盘点，不构成完成授权审查的声明。正式发布应核对实际版本所附许可证及NOTICE，必要声明不可因“无注释版”而删除。

## Node直接依赖

| 位置 | 组件 | 锁定版本 | 元数据许可证 |
| --- | --- | --- | --- |
| frontend | @types/node | 24.19.1 | MIT |
| frontend | @vitejs/plugin-vue | 6.0.9 | MIT |
| frontend | typescript | 5.9.3 | Apache-2.0 |
| frontend | vite | 7.3.7 | MIT |
| frontend | vue | 3.5.43 | MIT |
| frontend | vue-router | 4.6.4 | MIT |
| frontend | vue-tsc | 3.3.12 | MIT |
| server | @langchain/core | 1.2.18 | MIT |
| server | @langchain/textsplitters | 1.0.2 | MIT |
| server | @types/cors | 2.8.19 | MIT |
| server | @types/express | 5.0.6 | MIT |
| server | @types/multer | 2.3.0 | MIT |
| server | @types/node | 24.19.1 | MIT |
| server | cors | 2.8.6 | MIT |
| server | dotenv | 17.4.2 | BSD-2-Clause |
| server | express | 5.2.1 | MIT |
| server | multer | 2.4.0 | MIT |
| server | mysql2 | 3.24.5 | MIT |
| server | tsx | 4.23.15 | MIT |
| server | typescript | 5.9.3 | Apache-2.0 |

锁文件共记录254个安装位置，其中2个位置未声明许可证。传递依赖及Python安装包见JSON清单。相同组件在不同位置可能重复列出；此表不等于最终发行包的软件物料清单。

## Python与模型来源

业务使用FastAPI、Uvicorn、python-multipart；影像分析使用PyTorch、TorchVision、Pillow和NumPy。版本以依赖清单、实际安装元数据及后续干净环境验收为准。

模型结构通过torchvision.models实例化。TorchVision代码采用BSD-3-Clause，实际发布须遵守对应版本许可证。代码许可证不自动覆盖预训练权重。

- 官方代码许可：https://github.com/pytorch/vision/blob/main/LICENSE
- 官方预训练权重说明：https://docs.pytorch.org/vision/stable/models.html

训练代码默认pretrained=True，并调用EfficientNet_B0_Weights.DEFAULT。是否在交付权重训练时启用该选项、具体基础权重及训练数据条款，须由训练命令和材料确认，不能仅由默认值断言。

## 项目代码、数据和权重的界限

队友交付的训练和适配代码已由维护者确认同意采用MIT公开，作者权利保留。自有项目代码采用MIT，适用范围见docs/LICENSE_SCOPE.md。chest_model.pt、样例胸片和数据集不因项目代码选择许可证而自动获得再分发许可。

公开范围暂不包含权重、训练数据集、非样例的实际上传图片、业务导出、运行依赖、环境凭据和日志。examples/chest-xrays中的CC0公开样例按各自来源许可提供。后续若发布容器镜像，需重新核查镜像内依赖及许可证声明。

## 锁文件缺失许可的两项核查

busboy 1.6.0与streamsearch 1.1.0在锁文件中未声明许可证，但本地安装包均附LICENSE。已记录该证据，公开发行时仍须保留原始许可文本，不能仅凭锁文件缺失就视为无许可。


公开样例例外：examples/chest-xrays内三张文件按来源页CC0 1.0提供，原作者与来源见该目录README和SOURCES.json。不授予训练数据或模型权重的额外权利。


## 图像准入校验

Transformers及新增依赖版本和许可元数据见docs/dependency-licenses.json。本地图像特征使用openai/clip-vit-base-patch32，固定版本3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268。权重不随源码分发，按脚本从 https://huggingface.co/openai/clip-vit-base-patch32 下载。原始实现及许可：https://github.com/openai/CLIP 。项目MIT许可不改变第三方材料的条款。当前属于通用语义准入实验，验证范围见docs/INPUT_VALIDATION.md。
