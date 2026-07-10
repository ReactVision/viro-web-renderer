#!/bin/bash
#
# Copy the WASM renderer build artifacts from virocore/wasm into this package.
# Run after building virocore (cd ../virocore/wasm && ./build_web.sh).
#
set -e

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${VIRO_WASM_BUILD:-$PKG_DIR/../virocore/wasm/products/build}"
DEST_DIR="$PKG_DIR/wasm"

if [ ! -f "$SRC_DIR/viro-web.js" ]; then
  echo "ERROR: no build artifacts at $SRC_DIR"
  echo "Build first:  cd ../virocore/wasm && ./build_web.sh"
  echo "(or set VIRO_WASM_BUILD to the build output dir)"
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC_DIR/viro-web.js" "$SRC_DIR/viro-web.wasm" "$SRC_DIR/viro-web.data" "$DEST_DIR/"

echo "Copied into $DEST_DIR:"
ls -lh "$DEST_DIR"/viro-web.*
