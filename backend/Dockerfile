# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build deps (only needed to compile packages)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install into a prefix we can copy wholesale into the final image
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ─── Stage 2: final (lean runtime image) ─────────────────────────────────────
FROM python:3.12-slim AS final

WORKDIR /app

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Copy only the installed packages — no compiler, no apt cache
COPY --from=builder /install /usr/local

# Copy application source
COPY app/ ./app/

ENV APP_ENV=production \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]