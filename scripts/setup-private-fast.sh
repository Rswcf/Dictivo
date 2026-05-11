#!/usr/bin/env bash
set -euo pipefail

MODEL="${DICTIVO_MODEL:-small}"
REPO_URL="${DICTIVO_WHISPER_CPP_REPO:-https://github.com/ggml-org/whisper.cpp.git}"

if [[ -n "${DICTIVO_PRIVATE_FAST_HOME:-}" ]]; then
  PRIVATE_FAST_HOME="$DICTIVO_PRIVATE_FAST_HOME"
elif [[ "$(uname -s)" == "Darwin" ]]; then
  PRIVATE_FAST_HOME="$HOME/Library/Application Support/Dictivo/private-fast"
else
  PRIVATE_FAST_HOME="$HOME/.dictivo/private-fast"
fi

WHISPER_DIR="$PRIVATE_FAST_HOME/whisper.cpp"
MODELS_DIR="$PRIVATE_FAST_HOME/models"

mkdir -p "$PRIVATE_FAST_HOME" "$MODELS_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to install Private Fast." >&2
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake is required to build whisper.cpp. Install it first, then rerun this script." >&2
  exit 1
fi

if [[ -d "$WHISPER_DIR/.git" ]]; then
  git -C "$WHISPER_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$WHISPER_DIR"
fi

pushd "$WHISPER_DIR" >/dev/null

CMAKE_ARGS=(-S . -B build -DCMAKE_BUILD_TYPE=Release)
if [[ "$(uname -s)" == "Darwin" ]]; then
  CMAKE_ARGS+=(-DGGML_METAL=ON)
fi

if ! cmake "${CMAKE_ARGS[@]}"; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "Retrying CMake without Metal flags."
    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
  else
    exit 1
  fi
fi

if command -v sysctl >/dev/null 2>&1; then
  JOBS="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
elif command -v nproc >/dev/null 2>&1; then
  JOBS="$(nproc)"
else
  JOBS="4"
fi

cmake --build build --config Release -j "$JOBS"

if [[ -x models/download-ggml-model.sh ]]; then
  bash models/download-ggml-model.sh "$MODEL"
else
  mkdir -p models
  curl -L --fail \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin" \
    -o "models/ggml-${MODEL}.bin"
fi

MODEL_FILE="$(find "$WHISPER_DIR/models" -maxdepth 1 -type f -name "ggml-${MODEL}*.bin" | head -n 1)"
if [[ -z "$MODEL_FILE" ]]; then
  echo "Model download finished, but no ggml-${MODEL}*.bin file was found." >&2
  exit 1
fi

ln -sf "$MODEL_FILE" "$MODELS_DIR/$(basename "$MODEL_FILE")"

popd >/dev/null

echo "Private Fast installed."
echo "CLI: $WHISPER_DIR/build/bin/whisper-cli"
echo "Model: $MODELS_DIR/$(basename "$MODEL_FILE")"
echo ""
echo "Smoke test model: DICTIVO_MODEL=small scripts/setup-private-fast.sh"
echo "Higher quality model: DICTIVO_MODEL=large-v3-turbo scripts/setup-private-fast.sh"
