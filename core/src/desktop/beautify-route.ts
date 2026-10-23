const OFFICE=/\.(?:docx?|xlsx?|pptx?|docm|xlsm|pptm)$/i;
const OFFICE_REQUEST=/\b(?:word|excel|powerpoint|docx?|xlsx?|pptx?|docm|xlsm|pptm)\b/i;
const TEXT_REQUEST=/\b(?:markdown|typst)\b|\.(?:md|txt|typ)\b/i;
export type BeautifyRoute='office'|'typst'|'choose';
/** Office beautification belongs to the bundled add-in, never offline patch/export. */
export function beautifyRoute(text:string,names:string[],hasLiveOffice=false):BeautifyRoute{
 if(OFFICE_REQUEST.test(text))return 'office';
 if(TEXT_REQUEST.test(text))return 'typst';
 const office=names.filter(n=>OFFICE.test(n));
 if(office.length&&office.length!==names.length)return 'choose';
 if(office.length||(!names.length&&hasLiveOffice))return 'office';
 return 'typst';
}
export const OPEN_OFFICE_FOR_BEAUTIFY='Để làm đẹp tệp Word, Excel hoặc PowerPoint, hãy mở tệp trong ứng dụng Office tương ứng, mở add-in PVTA và dùng chức năng Làm đẹp tại đó. Add-in sẽ chỉnh trực tiếp trên tài liệu đang mở. Phần Làm đẹp trong ChatBox dành cho Markdown/văn bản và xuất PDF + mã nguồn Typst; không tạo lại hay sửa bản sao tệp Office ở đây.';
