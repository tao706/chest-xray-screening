# 自带胸片样例

这三张公开来源的胸片用于体验上传、缩放、真实推理和Grad-CAM流程。不是本项目训练集或评测集，也不能用这些图片证明模型准确率。

| 文件 | 原作者 | 来源 | 图片许可 |
| --- | --- | --- | --- |
| [chest-pa-01.jpg](chest-pa-01.jpg) | Mikael Häggström | [来源页面](https://commons.wikimedia.org/wiki/File:Normal_posteroanterior_(PA)_chest_radiograph_(X-ray).jpg) | CC0 1.0 |
| [chest-pa-02.png](chest-pa-02.png) | Stillwaterising | [来源页面](https://commons.wikimedia.org/wiki/File:Chest_Xray_PA_3-8-2010.png) | CC0 1.0 |
| [chest-pa-03-pneumonia.jpg](chest-pa-03-pneumonia.jpg) | Mikael Häggström | [来源页面](https://commons.wikimedia.org/wiki/File:X-ray_of_lobar_pneumonia.jpg) | CC0 1.0 |

来源页于2026-11-10核对，图片均标注CC0 1.0。保留原始文件字节，未裁剪、改色或移除原图标记。下载指纹与来源页SHA-1一致；分发文件SHA-256、尺寸及下载地址见SOURCES.json。样例按CC0处理，不改标为项目MIT。

第三张来源页将影像描述为右中叶大叶性肺炎，并记录已取得书面知情同意；这是来源页面提供的信息，不是本项目独立作出的诊断。它用于观察模型对有来源标签样例的输出，模型分数不保证超过当前显示阈值，也不保证与来源描述一致。

## 如何体验

1. 按项目安装指南启动服务，另行取得并放置有权使用的权重。
2. 在“新建检查”中上传任意一张样例，填写DEMO_SUBJECT_01和DEMO_STUDY_01等虚拟编号。
3. 查看14项评分、调整显示阈值、选择类别生成关注区域。
4. 每张样例都应另建检查，不能把它们当成同一患者同一次检查。

前两张来源页标注或归类为正常胸片，第三张来源页描述为肺炎；这些来源描述不是模型必须达到的输出。当前模型没有“正常”类别，低于阈值只表示没有类别达到显示条件，不代表正常。关注区域不是已确认病灶，不能用于医学判断。

公开样例无需使用项目维护者的个人上传记录。当前只提供图片，不随图片提供模型权重。
