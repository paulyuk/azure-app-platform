FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
ENV UV_PYTHON_DOWNLOADS=never UV_NO_CACHE=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml ./
RUN uv sync --offline --no-dev
COPY main.py contract.json ./
USER 10001:10001
CMD ["uv", "run", "--offline", "--no-sync", "main.py"]
