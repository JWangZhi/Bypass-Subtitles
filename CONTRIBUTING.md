# Contributing Guide

## 🌳 Branch Strategy (Git Flow)

```
main (production)
  │
  └── develop (integration)
        │
        ├── feature/xxx (new features)
        ├── bugfix/xxx (bug fixes)
        └── hotfix/xxx (urgent production fixes)
```

### Branches

| Branch | Purpose | Base | Merge To |
|--------|---------|------|----------|
| `main` | Production-ready code | - | - |
| `develop` | Integration branch | main | main (via release) |
| `feature/*` | New features | develop | develop |
| `bugfix/*` | Bug fixes | develop | develop |
| `hotfix/*` | Urgent fixes | main | main + develop |
| `release/*` | Release preparation | develop | main + develop |

## 🔄 Workflow

### 1. Start a Feature

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
# ... work on feature ...
git push -u origin feature/your-feature-name
# Create Pull Request to develop
```

### 2. Create a Release

```bash
git checkout develop
git checkout -b release/v1.0.0
# Update version, test, fix bugs
git checkout main
git merge release/v1.0.0
git tag v1.0.0
git push origin main --tags
git checkout develop
git merge release/v1.0.0
```

### 3. Hotfix (urgent)

```bash
git checkout main
git checkout -b hotfix/critical-fix
# ... fix the issue ...
git checkout main
git merge hotfix/critical-fix
git tag v1.0.1
git checkout develop
git merge hotfix/critical-fix
```

## 📦 Versioning (Semantic)

Format: `MAJOR.MINOR.PATCH` (e.g., `v1.2.3`)

| Type | When to Bump | Example |
|------|--------------|---------|
| MAJOR | Breaking changes | 1.0.0 → 2.0.0 |
| MINOR | New features (backward compatible) | 1.0.0 → 1.1.0 |
| PATCH | Bug fixes | 1.0.0 → 1.0.1 |

## 🚀 Release Process

1. Create `release/vX.X.X` from `develop`
2. Test thoroughly
3. Merge to `main`
4. Tag the release: `git tag vX.X.X`
5. Push: `git push origin main --tags`
6. GitHub will create a Release automatically (if configured)

## 📝 Commit Messages

Format: `type: short description`

```
feat: add translation caching
fix: resolve audio sync issue
docs: update README
refactor: simplify transcriber factory
test: add unit tests for translator
```
