# C4 后端容器：钱包 + 结算 两个 Python 服务同容器运行
# 端口：8001=wallet, 8000=commission
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY wallet_service/requirements.txt ./wallet/requirements.txt
COPY commission_service/requirements.txt ./commission/requirements.txt
RUN pip install --no-cache-dir -r wallet/requirements.txt -r commission/requirements.txt

COPY wallet_service/ ./wallet/
COPY commission_service/ ./commission/

EXPOSE 8000 8001

# 同时起两个 uvicorn
CMD ["sh", "-c", "cd /app/wallet && uvicorn app.main:app --host 0.0.0.0 --port 8001 & cd /app/commission && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
