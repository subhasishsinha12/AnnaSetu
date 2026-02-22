# Contributing to AnnaSetu

Thank you for your interest in contributing to India's food security mission!

## Development Setup

1. **Fork** this repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/AnnaSetu.git`
3. **Install dependencies** for the layer you're working on
4. **Create a branch**: `git checkout -b feat/your-feature-name`
5. **Make changes** with tests
6. **Submit a PR** to the `develop` branch

## Branch Naming Convention
- `feat/layer-01-iot-integration` — new features
- `fix/layer-05-credit-expiry-bug` — bug fixes
- `docs/api-reference-update` — documentation
- `test/layer-03-chaincode-coverage` — test improvements

## Commit Convention (Conventional Commits)
```
feat(layer-01): add IoT cold chain sensor integration
fix(layer-05): resolve credit balance calculation edge case
docs(layer-03): add chaincode deployment guide
test(layer-04): add Aadhaar hash unit tests
chore(infra): update Docker Compose for Fabric 2.5
```

## Code Standards
- **Node.js**: ESLint + Prettier (config in `.eslintrc.json`)
- **Python**: Black formatter, flake8 linting
- **Solidity**: Solhint, Hardhat test coverage > 90%
- **Tests**: Required for all new features

## Security
- Never commit real API keys, Aadhaar numbers, or credentials
- Use `.env` files (gitignored) for secrets
- Report security vulnerabilities privately to maintainers

## Areas Needing Contribution
- 🔴 IoT sensor mock service for development
- 🔴 Kirana POS merchant interface (Layer 06)
- 🟡 ONDC Buyer App for NGO mobile interface
- 🟡 Polygon ID ZK credential issuer service
- 🟢 Unit tests for all services
- 🟢 API documentation improvements
