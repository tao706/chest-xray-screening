# 数据集与检查结构

主办方数据划分为训练集、验证集和测试集：训练集包含 18513 次检查及完整多标签标注，验证集包含 859 次检查及标注，测试集包含 1414 次检查且标签保密。图片格式为 JPG 或 PNG，尺寸不固定，模型预处理必须统一通道、尺寸和归一化方式。

目录采用 images/subject_id/study_id/image_id.jpg 结构。Subject_id 是患者唯一编号，Study_id 是一次检查的唯一编号，一次 Study 可以包含一张或多张胸片。训练、推理、数据库存储和 CSV 提交都应以 Study 为业务单位，多张图像的概率需要在模型侧完成 Study 级聚合。

ViewPosition 表示 X 射线投射视角，PatientOrientation 表示检查时身体姿势，Rows 和 Columns 分别表示图像高度与宽度。Support Devices 表示是否存在医疗支持设备：1 为有、0 为没有、-1 为不确定、None 为报告未提及。
