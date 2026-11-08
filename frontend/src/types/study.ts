export interface SelectedImage {
    id: string;
    file: File;
    previewUrl: string;
    width?: number;
    height?: number;
    warning?: string;
  validationError?: string;
    checking?: boolean;
}
