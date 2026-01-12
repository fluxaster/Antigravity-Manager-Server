# ========================================
# Stage 1: Build Frontend
# ========================================
# ========================================
# Stage 1: Build Frontend
# ========================================
# ========================================
# Stage 1: Build Frontend
# ========================================
FROM node:20-slim AS frontend-builder

WORKDIR /app

# Install dependencies first (better cache)
COPY package.json package-lock.json ./
RUN npm ci

# Build frontend
COPY index.html tsconfig.json tsconfig.node.json vite.config.ts tailwind.config.js postcss.config.cjs ./
COPY src ./src
COPY public ./public
RUN npm run build

# ========================================
# Stage 2: Build Rust Binary
# ========================================
FROM debian:bookworm AS rust-builder


WORKDIR /app

# 配置 Debian 镜像源 (使用官方源)
# Debian 11 (Bullseye) 默认使用 http 源，无需修改

# Install build dependencies and Rust via rustup
# 先安装 ca-certificates 以支持 HTTPS
RUN apt-get update --allow-insecure-repositories --allow-releaseinfo-change && apt-get install -y --no-install-recommends --allow-unauthenticated \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 安装构建依赖（包含 Tauri 所需的 GTK 库）
# 注意：Debian 11 (Bullseye) 使用 libwebkit2gtk-4.0
RUN apt-get update --allow-insecure-repositories --allow-releaseinfo-change && apt-get install -y --no-install-recommends --allow-unauthenticated \
    build-essential \
    pkg-config \
    libssl-dev \
    libglib2.0-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    libjavascriptcoregtk-4.1-dev \
    libsoup-3.0-dev \
    && rm -rf /var/lib/apt/lists/*

# 安装 Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --profile minimal --default-toolchain stable

# Add Rust to PATH
ENV PATH="/root/.cargo/bin:${PATH}"

# Copy Cargo files first (better cache)
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock ./src-tauri/

# Create dummy source to cache dependencies
RUN mkdir -p src-tauri/src && \
    echo "fn main() {}" > src-tauri/src/main.rs && \
    echo "fn main() {}" > src-tauri/src/server_main.rs && \
    echo "" > src-tauri/src/lib.rs

# Build dependencies only
WORKDIR /app/src-tauri
# 注意：这里会尝试编译，但由于缺少源码可能会失败（这是预期的，只为了缓存依赖）
RUN cargo build --release --bin antigravity-server 2>/dev/null || true

# Now copy actual source and build
WORKDIR /app
# 必须复制 src/locales，因为 Rust 代码中使用了 include_str!
COPY src ./src
COPY src-tauri ./src-tauri
WORKDIR /app/src-tauri
RUN cargo build --release --bin antigravity-server

# ========================================
# Stage 3: Runtime
# ========================================
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update --allow-insecure-repositories --allow-releaseinfo-change && apt-get install -y --allow-unauthenticated \
    ca-certificates \
    libssl3 \
    libgtk-3-0 \
    libwebkit2gtk-4.1-0 \
    libsoup-3.0-0 \
    libjavascriptcoregtk-4.1-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy binary
COPY --from=rust-builder /app/src-tauri/target/release/antigravity-server /app/antigravity-server

# Copy frontend dist
COPY --from=frontend-builder /app/dist /app/dist

# Copy entrypoint
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create data directory
RUN mkdir -p /root/.config/antigravity-tools

# Environment
ENV PORT=8045
ENV RUST_LOG=info

EXPOSE 8045

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/antigravity-server"]
