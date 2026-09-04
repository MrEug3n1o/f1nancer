---
name: new-version
description: Bumps F1nancer APP_VERSION (e.g. 0.1.1 → 0.1.2), commits, pushes, and dispatches the Desktop release GitHub Actions workflow. Use when the user asks for a new version, version bump, app release, or to run the desktop-release workflow.
disable-model-invocation: true
---

# New version

Ship a new F1nancer desktop version: bump `APP_VERSION`, push it, then run **Desktop release**.

Invoking this skill **is** authorization to commit the version files, push to origin, and dispatch the workflow. Do not force-push, skip hooks, or amend unless the user explicitly asks.

## Version sources

| File | What to change |
|------|----------------|
| `backend/app/version.py` | `APP_VERSION = "x.y.z"` — source of truth |
| `desktop/f1nancer.iss` | fallback `#define MyAppVersion "x.y.z"` (keep in sync) |

Do **not** change `frontend/package.json` (`0.0.0` is unrelated). Build scripts and the release job read `APP_VERSION` themselves.

## Target version

1. Read current `APP_VERSION` from `backend/app/version.py`.
2. Choose the next version:

   | User says | Result from `0.1.1` |
   |-----------|---------------------|
   | nothing / "new version" / patch | `0.1.2` |
   | minor | `0.2.0` |
   | major | `1.0.0` |
   | an explicit version (`0.1.2` or `v0.1.2`) | that version, strip a leading `v` |

3. Confirm the chosen version in the reply before editing if the user did not name it explicitly.

## Workflow

Copy and track:

```
- [ ] Preflight
- [ ] Bump version files
- [ ] Commit and push
- [ ] Dispatch Desktop release
- [ ] Report the run URL
```

### 1. Preflight

Run in parallel:

```bash
git status
git branch -vv
git log -5 --oneline
git fetch origin
```

Abort if:

- `APP_VERSION` is not `X.Y.Z` digits
- requested version is not greater than current (unless the user asked to re-run the workflow **without** bumping)
- `v{version}` already exists: `gh release view "v{version}"` **or** `git ls-remote --tags origin "v{version}"`
- the branch is not up to date with its upstream and cannot be fast-forwarded

Stay on the current branch (usually `main`). Do not switch branches.

Unrelated dirty files (anything other than the two version files): leave them unstaged. Commit **only** the version files. Mention leftover dirty files in the final report.

### 2. Bump

Set the same `X.Y.Z` in both files. Match existing quoting/style. Nothing else in those files.

### 3. Commit and push

Stage only:

- `backend/app/version.py`
- `desktop/f1nancer.iss`

Commit (follow repo style: sentence case, imperative, period):

```bash
git commit -m "$(cat <<'EOF'
Bump app version to X.Y.Z.

EOF
)"
git status
```

Push with `required_permissions: ["all"]`:

```bash
git push -u origin HEAD
```

Stop if the push fails. The workflow checks out the remote ref; an unpushed bump builds the old version.

Do **not** create or push a `v*` git tag. The workflow already publishes GitHub Release `v{APP_VERSION}`. A tag push would start a second run.

### 4. Dispatch Desktop release

Workflow file: `.github/workflows/desktop-release.yml`  
Workflow name: `Desktop release`  
Trigger used: `workflow_dispatch` (not a tag)

```bash
gh workflow run desktop-release.yml --ref "$(git rev-parse --abbrev-ref HEAD)"
```

Then resolve the run (it can take a few seconds to appear):

```bash
gh run list --workflow=desktop-release.yml --branch "$(git rev-parse --abbrev-ref HEAD)" --limit 3
```

Open/print the newest run URL (`gh run view <id> --web` is fine to get the URL; prefer printing it).

Do **not** `gh run watch` the full Windows + macOS build unless the user asks to wait. Builds are long.

### 5. Report

Tell the user:

- old → new version
- commit SHA
- workflow run URL
- that GitHub Release `vX.Y.Z` is created when the `release` job finishes (Mac DMG + Windows Setup.exe)
- any files left uncommitted

## Re-run only

If the user wants to re-dispatch **Desktop release** for the version already on the branch (no bump): skip steps 2–3, still run preflight (tag/release may already exist — warn and only proceed if they confirm).

## Examples

**Patch (default):** current `0.1.1` → set `0.1.2` → commit → push → `gh workflow run desktop-release.yml --ref main`

**Explicit:** "release 0.2.0" → set `0.2.0` even if that skips `0.1.2`
