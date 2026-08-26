FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 10001 sandbox
WORKDIR /app
COPY main.py lender_stub.py ./
USER sandbox

ENTRYPOINT ["python", "main.py"]
