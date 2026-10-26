; Trình cài đặt PVTA cho Windows (Inno Setup). Biên dịch: iscc /DAppVersion=1.0.0 scripts\windows\pvta.iss
; Không cần quyền quản trị: chỉ chép gói vào thư mục tạm rồi chạy install.ps1 (dùng gói có sẵn, không tải).
#ifndef AppVersion
  #define AppVersion "1.5.2"
#endif

[Setup]
AppId={{6F6A1B34-3F0C-4B8E-9F5E-5A6F5D2C9A11}
AppName=PVTA
AppVersion={#AppVersion}
AppPublisher=Phan Anh
DefaultDirName={tmp}\PVTA-setup
PrivilegesRequired=lowest
Uninstallable=no
CreateAppDir=no
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=no
OutputDir=..\..\release
OutputBaseFilename=PVTA-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=pvta.ico
ShowLanguageDialog=no

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=Cài PVTA cho Word, Excel, PowerPoint
WelcomeLabel2=Trình này sẽ cài PVTA (phiên bản {#AppVersion}) cho tài khoản Windows hiện tại. Mất khoảng 1–2 phút. Nếu Windows hỏi xác nhận chứng chỉ, hãy chọn Yes.%n%nSau khi cài, PVTA tự kiểm tra bản mới và hiện nút Cập nhật trong khung PVTA.

[Files]
Source: "..\..\install\pvta.tar.gz"; DestDir: "{tmp}\pvta-setup"; Flags: deleteafterinstall
Source: "..\install.ps1"; DestDir: "{tmp}\pvta-setup"; Flags: deleteafterinstall

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""$env:PVTA_LOCAL_TGZ='{tmp}\pvta-setup\pvta.tar.gz'; & '{tmp}\pvta-setup\install.ps1'; Read-Host 'Nhan Enter de dong'"""; StatusMsg: "Đang cài PVTA..."; Flags: waituntilterminated
