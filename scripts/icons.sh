#!/usr/bin/env bash
# Rasterises public/favicon.svg into the PNG sizes index.html and the web
# manifest ask for. Run after editing the favicon, so the tab icon, the iOS
# home-screen icon, and the install prompt never drift apart.
#
#   ./scripts/icons.sh
#
# qlmanage is macOS's Quick Look renderer and ships with the OS, which is why
# it is used here rather than a dependency. It sizes to the SVG's intrinsic
# width/height, not the -s flag, so each size is rendered from a copy with
# those attributes rewritten.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/public/favicon.svg"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if ! command -v qlmanage >/dev/null; then
  echo "qlmanage not found — this script needs macOS." >&2
  echo "Elsewhere: rsvg-convert -w 512 -h 512 $src -o public/icon-512.png" >&2
  exit 1
fi

render() {
  local size="$1" out="$2"
  sed "s/width=\"80\" height=\"80\"/width=\"$size\" height=\"$size\"/" "$src" > "$work/in.svg"
  qlmanage -t -s "$size" -o "$work" "$work/in.svg" >/dev/null 2>&1
  mv "$work/in.svg.png" "$root/public/$out"
  echo "  public/$out (${size}px)"
}

echo "Rendering from public/favicon.svg:"
render 180 apple-touch-icon.png
render 192 icon-192.png
render 512 icon-512.png
