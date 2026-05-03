# Sử dụng image Python 3.11 gọn nhẹ
FROM python:3.11-slim

# Đặt thư mục làm việc trong container
WORKDIR /app

# Context là root monorepo (Railway Dockerfile path: ai-service/Dockerfile).
# Nếu đặt Railway Root Directory = ai-service thì đổi lại thành COPY requirements.txt . và COPY . .
COPY ai-service/requirements.txt .

# Cài đặt thư viện Python
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ code Python vào /app
COPY ai-service/ .

# Railway (và nhiều PaaS) inject PORT; local dev vẫn dùng 8000 nếu không set.
EXPOSE 8000

ENV PYTHONUNBUFFERED=1

# shell form để Railway có thể truyền $PORT
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
