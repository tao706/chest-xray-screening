import multer from "multer";
export const uploadStudyImages = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: 20,
        fileSize: 10 * 1024 * 1024
    },
    fileFilter(_request, file, callback) {
        if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
            callback(new Error(`${file.originalname}不是JPG、JPEG或PNG图片`));
            return;
        }
        callback(null, true);
    }
}).array("images", 20);
