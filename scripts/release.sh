#!/usr/bin/env bash
# Builds the plugin package and publishes it as a GitHub release.
#
#   npm run release            # tag v<version>, push it, create the release with the .lplug4
#   npm run release -- --dry-run   # everything except tagging, pushing and publishing
#
# The version comes from package.json and must match package/metadata/LoupedeckPackage.yaml.
# Requires a clean working tree on main that is in sync with origin, and the gh CLI logged in.
set -euo pipefail

cd "$(dirname "$0")/.."

dry_run=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

version=$(node -p "require('./package.json').version")
manifest_version=$(sed -n 's/^version: *//p' package/metadata/LoupedeckPackage.yaml)
name=$(sed -n 's/^name: *//p' package/metadata/LoupedeckPackage.yaml)
tag="v$version"
asset="$name-$version.lplug4"

if [ "$version" != "$manifest_version" ]; then
  echo "package.json says $version but LoupedeckPackage.yaml says $manifest_version; align them first" >&2
  exit 1
fi

if ! $dry_run; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "working tree is not clean; commit or stash first" >&2
    exit 1
  fi
  branch=$(git rev-parse --abbrev-ref HEAD)
  if [ "$branch" != "main" ]; then
    echo "releases are cut from main, not $branch" >&2
    exit 1
  fi
  git fetch -q origin main
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    echo "main is not in sync with origin/main; push or pull first" >&2
    exit 1
  fi
  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null || git ls-remote --exit-code --tags origin "$tag" >/dev/null 2>&1; then
    echo "tag $tag already exists; bump the version in package.json and LoupedeckPackage.yaml" >&2
    exit 1
  fi
  if gh release view "$tag" >/dev/null 2>&1; then
    echo "release $tag already exists on GitHub" >&2
    exit 1
  fi
fi

echo "==> $name $version: typecheck, test, build"
npm run typecheck
npm test
npm run build:pack
mv -f "$name.lplug4" "$asset"
echo "==> packaged $asset ($(du -h "$asset" | cut -f1))"

notes=$(cat <<NOTES
Download \`$asset\` and double-click it to install the plugin into Logi Options+. If a
development build is linked (\`npm run link\`), unlink it first or the installation fails.
Then write \`~/.config/logitech-options-plus-home-assistant/config.json\` as described in the
[README](https://github.com/maciejmajewski/logitech-mx-keypad-homeassistant#installation)
and add keys from the Home Assistant groups in Options+.
NOTES
)

if $dry_run; then
  echo "==> dry run: would tag $tag, push it and publish release $tag with $asset"
  exit 0
fi

echo "==> tagging $tag"
git tag -a "$tag" -m "$name $version"
git push -q origin "$tag"

echo "==> publishing release $tag"
gh release create "$tag" "$asset" --title "$name $version" --notes "$notes" --generate-notes
echo "==> done: $(gh release view "$tag" --json url -q .url)"
