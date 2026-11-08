# 结果文件规范

提交文件名为 submission.csv，编码为 UTF-8。字段及顺序固定为 Subject_id、Study_id、Predict_class、Probability。一个 Study 命中多个类别时，每个类别单独占一行。

Predict_class 必须是 1 到 10 的整数，Probability 必须在 0 到 1 之间。文件不能存在空值，也不能出现重复的 Study_id 与 Predict_class 组合，并且需要覆盖测试集全部 Study。

结果文件模块使用批量任务保存的阈值筛选类别。若某个检查没有任何类别达到阈值，系统补入该检查概率最高的一类并记录补位数量。存在分析失败、检查缺失、重复行或非法概率时，校验不会通过，也不能下载结果文件。
