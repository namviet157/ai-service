# 🛂 Zero-Stop e-Border: Smart HS Code Classification Workflow

Hệ thống tự động hóa phân loại mã HS (HS Code) cho nông sản dựa trên AI, được xây dựng và thiết kế trên nền tảng **n8n**. Workflow này kết hợp mô hình ngôn ngữ lớn (LLMs) và cơ sở dữ liệu vector (Vector Database) để tương tác, thu thập thông tin và tư vấn mã hải quan chính xác cho doanh nghiệp.

## 🏗️ Kiến trúc Hệ thống (Workflow Architecture)

Workflow được thiết kế theo mô hình **State Machine (Máy trạng thái)** kết hợp **Multi-Agent**, chia làm 4 cụm xử lý chính:

### 1. Cổng Tiếp Nhận & Điều Phối (Gateway & Router)
*   **Webhook:** Điểm neo tiếp nhận mọi yêu cầu từ giao diện người dùng (gửi tin nhắn text hoặc bấm nút confirm).
*   **Switch (Mode: Rules):** Bộ định tuyến lõi. Phân loại luồng dữ liệu dựa trên loại sự kiện (event type):
    *   **Nhánh 1 (Top):** Xử lý tin nhắn văn bản thông thường (Text input).
    *   **Nhánh 2 (Bottom):** Xử lý sự kiện xác nhận (Button click/Action payload).

### 2. Trọng Tài Phân Loại (Nhánh 1 - Text Input)
*   **AI Agent 1 (Classifier):** Đóng vai trò kiểm duyệt hồ sơ.
    *   Sử dụng **Groq Chat Model** để đọc hiểu ngôn ngữ tự nhiên.
    *   Gắn kèm **Simple Memory** để duy trì bối cảnh (context) xuyên suốt phiên chat của người dùng.
    *   Ép khuôn dữ liệu đầu ra bằng **Structured Output Parser** (trả về chuẩn JSON chứa: `is_ready`, `current_item`, `missing_info`, `final_query`).

### 3. Ngã Ba Quyết Định & Thực Thi (If1)
Dựa vào biến `is_ready` từ Agent 1, luồng được rẽ làm hai hướng:

*   🔴 **False Branch (Thiếu thông tin - Đi xuống AI Agent 2):**
    *   **AI Agent 2:** Nhận nhiệm vụ "Vấn đáp". Dựa vào `missing_info`, Agent sinh ra các câu hỏi trắc nghiệm/gợi ý để người dùng bổ sung thông tin (Quy cách đóng gói, trạng thái xử lý...).
    *   Đẩy kết quả hiển thị ra web qua node **Respond to Webhook 1**.

*   🟢 **True Branch (Đủ thông tin - Đi lên AI Agent):**
    *   **AI Agent (Chuyên gia tra cứu):** Kích hoạt khi hồ sơ đã đủ điều kiện.
    *   **Qdrant Vector Store:** Cung cấp cơ sở dữ liệu RAG (Retrieval-Augmented Generation) để tra cứu luật và mã HS. Dữ liệu văn bản được nhúng (embed) thông qua **HuggingFace Embeddings**.
    *   Phân tích kết quả, đưa ra mã HS chuẩn xác nhất kèm giải thích, sau đó xuất ra web qua **Respond to Webhook**.

### 4. Luồng Chốt Hồ Sơ (Nhánh 2 - Button Action)
*   **If Node:** Kiểm tra mã hành động từ giao diện (ví dụ: `CONFIRM_HS`).
*   **Respond to Webhook 2:** Trả về thông báo thành công và chốt tờ khai vào hệ thống, đóng lại vòng lặp nghiệp vụ.

## 🚀 Công Nghệ Sử Dụng (Tech Stack)
*   **Orchestration:** n8n
*   **LLM Provider:** Groq (xử lý tốc độ cao cho Agent & Parser).
*   **Vector Database:** Qdrant (Lưu trữ và truy xuất vector RAG).
*   **Embeddings:** HuggingFace.

## 🛠️ Hướng Dẫn Cài Đặt (Setup)

1.  Import file JSON của workflow này vào instance n8n của bạn.
2.  Cấu hình **Credentials** cho các node:
    *   `Groq API Key` cho tất cả các node Groq Chat Model.
    *   `Qdrant API Key` & Cluster URL cho node Qdrant Vector Store.
    *   `HuggingFace Inference API` cho bộ nhúng (nếu yêu cầu).
3.  Cập nhật URL của node Webhook (dạng Production) vào source code Frontend.
4.  Kích hoạt (Active) workflow và tiến hành test luồng hội thoại.