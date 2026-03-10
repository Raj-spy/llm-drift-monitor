#!/usr/bin/env bash
# ============================================================
# LLM Drift Monitor — One-command local dev setup
# Usage: chmod +x scripts/dev-setup.sh && ./scripts/dev-setup.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()  { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

echo ""
echo "🚀  LLM Drift Monitor — Development Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Prerequisites check ───────────────────────────────────────
step "Checking prerequisites"

command -v python3 &>/dev/null && info "Python 3 found: $(python3 --version)" || error "Python 3 required"
command -v node &>/dev/null && info "Node found: $(node --version)" || error "Node.js required (v18+)"
command -v docker &>/dev/null && info "Docker found" || warn "Docker not found — backend will run locally"
command -v pip &>/dev/null || error "pip required"

# ── Backend setup ─────────────────────────────────────────────
step "Setting up Python backend"

cd backend

if [ ! -f .env ]; then
    cp .env.example .env
    warn "Created backend/.env — fill in your Supabase + API keys before starting!"
fi

python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install -q -r requirements.txt
info "Backend dependencies installed"

cd ..

# ── SDK setup ─────────────────────────────────────────────────
step "Setting up Python SDK"

cd sdk
pip install -q -e ".[all]"
info "SDK installed in editable mode"
cd ..

# ── Frontend setup ────────────────────────────────────────────
step "Setting up Next.js frontend"

cd frontend

if [ ! -f .env.local ]; then
    cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000/v1
EOF
    warn "Created frontend/.env.local — fill in your Supabase values!"
fi

npm install --silent
info "Frontend dependencies installed"

cd ..

# ── Summary ───────────────────────────────────────────────────
step "Setup complete!"

echo ""
echo "  📋  Next steps:"
echo ""
echo "  1. Edit backend/.env with your Supabase + API keys"
echo "  2. Edit frontend/.env.local with your Supabase keys"
echo "  3. Run docs/schema.sql in your Supabase SQL Editor"
echo ""
echo "  🖥  Start the backend:"
echo "      cd backend && source .venv/bin/activate"
echo "      uvicorn app.main:app --reload --port 8000"
echo ""
echo "  🌐  Start the frontend:"
echo "      cd frontend && npm run dev"
echo ""
echo "  📦  Or use Docker (after filling .env):"
echo "      docker compose up -d"
echo ""
echo "  🔧  Run setup wizard:"
echo "      cd backend && python scripts/setup.py"
echo ""
echo "  🧪  Run tests:"
echo "      cd backend && pytest tests/ -v"
echo "      cd sdk && pytest tests/ -v"
echo ""
