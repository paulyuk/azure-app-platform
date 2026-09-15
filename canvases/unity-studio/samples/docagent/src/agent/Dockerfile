FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
ENV UV_INDEX_URL=https://packagefeedproxy.microsoft.io/pypi/simple/
ENV UV_DEFAULT_INDEX=https://packagefeedproxy.microsoft.io/pypi/simple/
ENV XDG_CACHE_HOME=/opt/unity-runtime-cache
RUN groupadd --gid 10001 unity && useradd --uid 10001 --gid unity --create-home unity

WORKDIR /app/src/agent
COPY src/agent/pyproject.toml ./pyproject.toml
RUN uv sync --no-dev
RUN uv run python -m copilot download-runtime

COPY src/agent/main.py ./main.py
COPY src/agent/prompts ./prompts
COPY config /app/config
COPY src/policy /app/src/policy
RUN mkdir -p /var/lib/unity-copilot && chown 10001:10001 /var/lib/unity-copilot \
    && chmod -R a+rX,a-w /app /opt/unity-runtime-cache

ENV COPILOT_HOME=/var/lib/unity-copilot
ENV PYTHONUNBUFFERED=1
ENV UV_CACHE_DIR=/tmp/uv-cache
ENV HOME=/home/unity
USER 10001:10001
EXPOSE 8080
CMD ["uv", "run", "--no-sync", "main.py", "--sandbox-worker", "--host", "0.0.0.0", "--port", "8080"]
