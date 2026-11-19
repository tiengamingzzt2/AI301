# An Tín · máy chủ Gemini theo vùng

API riêng chạy trên Vercel Functions tại vùng `iad1` (Hoa Kỳ). Website An Tín gọi API này qua máy chủ Sites; trình duyệt không nhận khóa Gemini hoặc khóa chuyển tiếp.

1. Chạy `node scripts/sync-ai.mjs` để sao chép logic AI mới nhất từ thư mục gốc. Không sao chép `.gemini-key`.
2. Triển khai thư mục này thành một dự án Vercel. Cấu hình hai biến môi trường bí mật `GEMINI_API_KEY` và `AI_RELAY_TOKEN` cho production.
3. Gọi thử `/api/ai` với dữ liệu giả và xác nhận Gemini phản hồi từ vùng triển khai.
4. Chỉ sau khi bước 3 thành công, cấu hình `AI_RELAY_URL=https://<ten-du-an>.vercel.app/api/ai` và cùng `AI_RELAY_TOKEN` trong môi trường Sites, rồi kiểm tra qua website công khai.

Nếu Gemini vẫn trả lỗi khu vực tại vùng được chọn, dừng chuyển tiếp và kiểm tra vị trí IP thực tế với Google. Đổi vùng trong `vercel.json` và triển khai lại nếu cần. Không đặt các khóa trong mã nguồn hoặc đường dẫn URL.
