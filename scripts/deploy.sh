#!/usr/bin/env bash
# ============================================================
# LLM Drift Monitor — Production Deploy Script
# Usage: ./scripts/deploy.sh [backend|frontend|all]
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

TARGET="${1:-all}"
VERSION=$(git describe --tags --always 2>/dev/null || echo "latest")
REGISTRY="${DOCKER_REGISTRY:-ghcr.io/your-org/llm-drift-monitor}"

echo ""
echo "🚀  Deploying LLM Drift Monitor v${VERSION}"
echo "    Target: ${TARGET}"
echo ""

# ── Backend (Docker) ──────────────────────────────────────────
deploy_backend() {
    echo "📦  Building Docker image..."
    docker build \
        --tag "${REGISTRY}/api:${VERSION}" \
        --tag "${REGISTRY}/api:latest" \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg VERSION="${VERSION}" \
        ./backend

    info "Image built: ${REGISTRY}/api:${VERSION}"

    echo "📤  Pushing to registry..."
    docker push "${REGISTRY}/api:${VERSION}"
    docker push "${REGISTRY}/api:latest"
    info "Pushed to registry"

    # Deploy to server via docker compose pull + up
    if [ -n "${DEPLOY_HOST:-}" ]; then
        echo "🖥  Deploying to ${DEPLOY_HOST}..."
        ssh "${DEPLOY_HOST}" << REMOTE
            cd /opt/llm-drift-monitor
            docker compose pull api
            docker compose up -d api
            docker image prune -f
REMOTE
        info "Backend deployed to ${DEPLOY_HOST}"
    else
        warn "DEPLOY_HOST not set — skipping remote deploy. Run manually: docker compose up -d"
    fi
}

# ── Frontend (Vercel) ─────────────────────────────────────────
deploy_frontend() {
    command -v vercel &>/dev/null || npm install -g vercel

    echo "🌐  Deploying frontend to Vercel..."
    cd frontend

    if [ "${CI:-}" = "true" ]; then
        # CI/CD non-interactive deploy
        vercel deploy --prod \
            --token "${VERCEL_TOKEN}" \
            --yes \
            -e NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
            -e NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
            -e NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL}"
    else
        vercel deploy --prod
    fi

    cd ..
    info "Frontend deployed to Vercel"
}

# ── SDK (PyPI) ────────────────────────────────────────────────
deploy_sdk() {
    echo "📦  Publishing SDK to PyPI..."
    cd sdk

    # Bump version in pyproject.toml (set $SDK_VERSION env var to override)
    if [ -n "${SDK_VERSION:-}" ]; then
        sed -i "s/version = \".*\"/version = \"${SDK_VERSION}\"/" pyproject.toml
        info "Version bumped to ${SDK_VERSION}"
    fi

    pip install -q build twine
    python -m build
    twine upload dist/* --non-interactive

    cd ..
    info "SDK published to PyPI"
}

# ── Run ───────────────────────────────────────────────────────
case "$TARGET" in
    backend)  deploy_backend ;;
    frontend) deploy_frontend ;;
    sdk)      deploy_sdk ;;
    all)
        deploy_backend
        deploy_frontend
        ;;
    *)
        error "Unknown target: $TARGET. Use: backend | frontend | sdk | all"
        ;;
esac

echo ""
info "Deployment complete! ✨"
