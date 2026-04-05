FROM python:3.12-slim

# Install libheif system dependency for pillow-heif
RUN apt-get update && apt-get install -y --no-install-recommends \
        libheif-dev \
        libffi-dev \
        gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY cave_scan_service.py .

CMD ["python", "-u", "cave_scan_service.py"]
