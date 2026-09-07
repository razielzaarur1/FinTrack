FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN useradd -m -u 1000 notifier

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

USER notifier

EXPOSE 3001

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3001"]
