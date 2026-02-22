# Contributing to AnnaSetu

## Branch Strategy
- `main` — production-ready code
- `develop` — integration branch
- `feature/layer-XX-description` — feature branches

## Layer Owners
| Layer | Owner | Stack |
|-------|-------|-------|
| layer-01-donor | Backend Team | Node.js |
| layer-02-ondc | Integration Team | Node.js + Beckn |
| layer-03-blockchain | Blockchain Team | Go/Node.js + Solidity |
| layer-04-identity | Security Team | Python |
| layer-05-finance | FinTech Team | Node.js |
| layer-06-beneficiary | Frontend Team | React |

## Commit Convention
```
feat(layer-01): add IoT sensor telemetry endpoint
fix(layer-05): handle expired voucher redemption
docs: update ONDC integration guide
test(layer-04): add KYC OTP verification tests
```
