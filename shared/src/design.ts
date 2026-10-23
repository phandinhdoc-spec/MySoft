/** Model-authored proposals, not identifiers in an Office theme catalog. */
export interface DesignIdea {
 id:string;name:string;reason:string;layout:string;hierarchy:string;tables:string;
 fonts:{heading:string;body:string};colors:{accent:string;text:string;background:string};
 bodySize:number;headingSizes:[number,number,number];
}
export interface DesignSuggestion {direction:string;ideas:DesignIdea[]}
export function designRequest(idea:DesignIdea):string{
 return `Làm đẹp tài liệu đang mở theo phương án tôi đã chọn: ${idea.name}.\nTHIẾT KẾ ĐÃ CHỌN:\n${JSON.stringify(idea)}\nĐọc lại tài liệu trước khi sửa. Áp đúng bố cục, phông, màu, cỡ và phân cấp của phương án; dùng công cụ định dạng theo từng vai trò. Không thay bằng theme/preset Office. Giữ nguyên nội dung, dữ liệu, công thức và hình; mục lục/danh mục hỏi riêng trước khi thêm. Kiểm tra kết quả sau khi áp dụng và báo giới hạn thực tế.`;
}
