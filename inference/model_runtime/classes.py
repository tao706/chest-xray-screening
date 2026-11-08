from dataclasses import dataclass


@dataclass(frozen=True)
class ChestXrayClass:
    class_id: int
    class_name: str
    class_name_en: str

    def as_dict(self) -> dict:
        return {"class_id": self.class_id, "class_name": self.class_name, "class_name_en": self.class_name_en}


CHEST_XRAY_CLASSES = (
    ChestXrayClass(1, "肺不张", "Atelectasis"),
    ChestXrayClass(2, "心影扩大", "Cardiomegaly"),
    ChestXrayClass(3, "肺部实变", "Consolidation"),
    ChestXrayClass(4, "肺水肿", "Edema"),
    ChestXrayClass(5, "胸腔积液", "Effusion"),
    ChestXrayClass(6, "肺气肿", "Emphysema"),
    ChestXrayClass(7, "肺纤维化", "Fibrosis"),
    ChestXrayClass(8, "膈疝", "Hernia"),
    ChestXrayClass(9, "肺浸润", "Infiltration"),
    ChestXrayClass(10, "肺部肿块", "Mass"),
    ChestXrayClass(11, "肺结节", "Nodule"),
    ChestXrayClass(12, "胸膜增厚", "Pleural_Thickening"),
    ChestXrayClass(13, "肺炎", "Pneumonia"),
    ChestXrayClass(14, "气胸", "Pneumothorax"),
)
