# AnnaSetu CI/CD Pipeline

GitHub Actions workflows are configured in `.github/workflows/ci.yml`.

## Pipeline Jobs
- **test-donor-api** — Jest tests for Layer 01 against MongoDB
- **test-identity** — Pytest for Layer 04 FastAPI
- **build-frontend** — Vite build for Layer 06 React app
- **docker-validate** — Validates Docker Compose config
- **security-scan** — npm audit across all Node.js layers
