FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
ENV UV_INDEX_URL=https://packagefeedproxy.microsoft.io/pypi/simple/
ENV UV_DEFAULT_INDEX=https://packagefeedproxy.microsoft.io/pypi/simple/
RUN groupadd --gid 10001 unity && useradd --uid 10001 --gid unity --create-home unity

WORKDIR /app/src/tools/document-validation
COPY src/tools/document-validation/pyproject.toml ./pyproject.toml
RUN uv sync --no-dev
COPY src/tools/document-validation/main.py ./main.py
COPY src/tools/document-validation/contract.json ./contract.json
COPY src/policy /app/src/policy
COPY config/document-policy.json /app/config/document-policy.json
RUN chmod -R a+rX,a-w /app

ENV PYTHONUNBUFFERED=1
ENV UV_CACHE_DIR=/tmp/uv-cache
ENV HOME=/home/unity
USER 10001:10001
EXPOSE 8080
CMD ["uv", "run", "--no-sync", "main.py", "--serve", "--host", "0.0.0.0", "--port", "8080"]
