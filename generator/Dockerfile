# Stage 1: Generate static HTML
FROM ubuntu:24.04 AS builder

WORKDIR /build
COPY generate-page .
RUN chmod +x generate-page && ./generate-page > index.html

# Stage 2: Production nginx (unprivileged - runs as non-root)
FROM nginxinc/nginx-unprivileged:1.28

# Labels
LABEL org.opencontainers.image.source="https://github.com/user/repo"
LABEL org.opencontainers.image.version="1.0.0"

# Copy generated HTML
COPY --from=builder /build/index.html /usr/share/nginx/html/index.html

# Document port (unprivileged nginx uses 8080)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

