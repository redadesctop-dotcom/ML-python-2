FROM python:3.11-slim

# Set build-time variables
ARG APP_VERSION=1.0.0

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY config/ ./config/

# Environment setup
ENV PYTHONPATH=/app/src:/app
ENV ENVIRONMENT=production
ENV LOG_LEVEL=INFO

# Healthcheck
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Default command (can be overridden)
ENTRYPOINT ["uvicorn", "src.auth_service.auth:app", "--host", "0.0.0.0", "--port", "8000"]
