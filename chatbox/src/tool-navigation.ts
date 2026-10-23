import {t as uiText} from './i18n';
import {TEACHER_FEATURES,type FeatureKey} from '../../shared/src/teacherSuite';
export type ToolsSection='docs'|'pro'|'groups';
export type ProTab=FeatureKey|'math';

export const SECTIONS:{key:ToolsSection;icon:string;title:string;hint:string}[]=[
 {key:'docs',icon:'file',title:uiText("Tài liệu & Cá nhân hóa"),hint:uiText("PDF, làm đẹp, kiểm tra số liệu")},
 {key:'pro',icon:'exam',title:uiText("Bộ công cụ chuyên môn"),hint:uiText("Đề, điểm, văn bản, giáo án, Toán")},
 {key:'groups',icon:'groups',title:uiText("Nhóm & công việc"),hint:uiText("Công cụ, nhóm, văn bản, căn cứ")},
];
export const DOC_TOOLS:[string,string,string,string][]=[
 ['⧉',uiText("Làm việc với PDF"),uiText("Mở PDF bên cạnh khung chat: xem, tô sáng, ghi chú, sắp xếp trang và hỏi PVTA."),'pdf'],
 ['▤',uiText("Làm đẹp tài liệu"),uiText("Markdown/văn bản: xuất PDF + Typst. Word, Excel, PowerPoint: mở trong Office và dùng add-in PVTA."),'beautify'],
 ['∑',uiText("Kiểm tra số liệu"),uiText("Tính bằng Python, đối chiếu số liệu giữa tài liệu."),'accounting'],
 ['◇',uiText("Quản lý chế độ viết"),uiText("Sửa, nhân bản và tạo chỉ dẫn riêng cho PVTA."),'modes'],
 ['◉',uiText("Những điều đã học"),uiText("Xem nguồn, sửa hoặc xóa sở thích đã ghi nhớ."),'learned'],
];
/** Gộp Xưởng Toán vào cùng hàng với 5 công cụ chuyên môn; Toán có tông màu riêng. */
export const PRO_TABS:{key:ProTab;icon:string;title:string;badge:string;tone:string}[]=[
 ...TEACHER_FEATURES.map(f=>({key:f.key as ProTab,icon:f.icon,title:uiText(f.shortTitle),badge:uiText(f.badge),tone:f.tone as string})),
 {key:'math',icon:'math',title:uiText("Xưởng Toán"),badge:uiText("Hình · Đồ thị · Biến thể"),tone:'teal'},
];


export const DOC_TOOL_ICONS:Record<string,string>={pdf:'file',beautify:'palette',accounting:'calculator',modes:'settings',learned:'brain'};
export const GROUP_TOOL_ICONS:Record<string,string>={groups:'groups',docs:'office',basis:'scale',learn:'spark'};
