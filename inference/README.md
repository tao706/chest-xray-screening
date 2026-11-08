# FastAPI影像分析服务

当前运行基准为队友交付的EfficientNet-B0权重，14类多标签评分，224像素输入。默认pytorch，缺少权重时明确失败，不自动使用模拟结果。

安装及启动以根目录README.md和docs/INSTALL_WINDOWS.md为准。安装器使用Python 3.12的.venv312与requirements-win-cpu.lock.txt；不要只安装requirements.txt，那份清单仅含Web服务依赖。

权重单独放入weights/chest_model.pt，配置参考.env.example。类别及文件指纹见docs/MODEL_CARD.md。Grad-CAM只显示关注区域，不是病灶检测框。

model_runtime/mock_backend.py保留用于工程测试，其存在不代表正式启动采用模拟后端。公开源码不包含胸片和权重，真实推理验收需另行准备合法样例。
