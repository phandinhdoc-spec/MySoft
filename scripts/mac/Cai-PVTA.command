#!/usr/bin/env bash
# PVTA – bấm đúp (hoặc chuột phải > Mở) để cài từ file .dmg. Dùng gói có sẵn trong đĩa, không cần tải PVTA.
cd "$(dirname "$0")" || exit 1
clear
echo "=== Cài đặt PVTA cho Word / Excel / PowerPoint ==="
echo "Xin chờ 1–2 phút. Máy có thể hỏi mật khẩu đăng nhập Mac một lần: hãy nhập và chọn Cho phép."
echo
if PVTA_LOCAL_TGZ="$PWD/pvta.tar.gz" bash ./install.sh; then
  echo
  echo "Xong. Có thể đẩy đĩa PVTA ra (Eject). Mở lại Word / Excel / PowerPoint, rồi vào Chèn → Phần bổ trợ → PVTA."
else
  echo
  echo "Cài chưa xong. Hãy chụp màn hình cửa sổ này gửi cho người hỗ trợ."
fi
echo
read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng cửa sổ…"
echo
