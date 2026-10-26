; Trinh cai dat PVTA Studio cho Windows (Inno Setup): cai PVTA Chat va tien ich Office trong mot lan.
; Bien dich: iscc /DAppVersion=1.3.1 scripts\windows\studio.iss  -> release\PVTA-Studio-Setup-<version>.exe
; Truoc khi bien dich, dat vao release\studio-payload: PVTA-Chatbox-<v>-x64.exe, PVTA-Chatbox-<v>-arm64.exe,
; pvta-office.tar.gz, office-latest.json. Mot tep chay duoc tren Windows x64 va ARM64, khong can Internet.
; Khong can quyen quan tri. Tep chi dung ASCII de Inno Setup doc dung moi ma trang.
#ifndef AppVersion
  #define AppVersion "1.5.2"
#endif

[Setup]
AppId={{B7C1D6A2-5E3F-4A9B-8D21-6C4F0E7A93B5}
AppName=PVTA Studio
AppVersion={#AppVersion}
AppPublisher=Phan Anh
DefaultDirName={tmp}\pvta-studio-setup
PrivilegesRequired=lowest
Uninstallable=no
CreateAppDir=no
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=no
OutputDir=..\..\release
OutputBaseFilename=PVTA-Studio-Setup-{#AppVersion}
; Cac goi ben trong da nen san: nen them khong giam dang ke, chi lam cham.
Compression=zip/1
SolidCompression=no
WizardStyle=modern
SetupIconFile=pvta.ico
ShowLanguageDialog=no

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=Cai PVTA Chat va tien ich Office
WelcomeLabel2=Trinh nay cai PVTA Chat va tien ich PVTA cho Word, Excel, PowerPoint trong mot lan (phien ban {#AppVersion}). Mat khoang 1-2 phut (chi can Internet neu may chua co Node.js). Neu Windows hoi xac nhan chung chi thi chon Yes.

[Files]
Source: "..\..\installers\studio.ps1"; DestDir: "{tmp}\pvta-studio"; Flags: deleteafterinstall
Source: "..\..\release\studio-payload\*"; DestDir: "{tmp}\pvta-studio\payload"; Flags: deleteafterinstall

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""$env:PVTA_PAYLOAD='{tmp}\pvta-studio\payload'; & '{tmp}\pvta-studio\studio.ps1'"""; StatusMsg: "Dang cai PVTA..."; Flags: waituntilterminated
