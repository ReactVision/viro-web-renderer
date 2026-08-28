#!/bin/bash
#
# Copy the tinyvio tracking engine into this package.
#
# Web AR needs a second WASM module, and before it was bundled here every
# consumer had to obtain and host it themselves. It ships in the npm tarball
# (see "files" in package.json) and is git-ignored here for the same reason the
# renderer's own binaries are: it is build output of another repository, and
# reviewing a 265 KB binary diff on every tracker change is not review.
#
# Build it first:  cd ../tinyvio && ./scripts/build_slam_wasm.sh
# Override the source with TINYVIO=/path.
#
set -e

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${TINYVIO:-$PKG_DIR/../tinyvio}/web/slam"
DEST_DIR="$PKG_DIR/slam"

if [ ! -f "$SRC_DIR/tinyvio-slam.js" ]; then
  echo "ERROR: no tracking engine at $SRC_DIR"
  echo "Build it first:  cd ../tinyvio && source \"\$EMSDK/emsdk_env.sh\" && ./scripts/build_slam_wasm.sh"
  echo "(or set TINYVIO to the repo root)"
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC_DIR/tinyvio-slam.js" "$SRC_DIR/tinyvio-slam.wasm" "$DEST_DIR/"

echo "Copied into $DEST_DIR:"
ls -lh "$DEST_DIR"/tinyvio-slam.*
