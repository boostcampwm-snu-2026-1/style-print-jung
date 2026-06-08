#!/usr/bin/env bash
set -euo pipefail

# Run the API and web dev servers together.
# On exit / Ctrl-C, kill the WHOLE process group (this script + npm + tsx +
# vite + their esbuild/node children) so nothing lingers in the background.
# `kill 0` targets every process in this script's process group, which is the
# only reliable way to also reap grandchildren (tsx -> esbuild, vite -> esbuild).
trap 'trap - INT TERM EXIT; kill 0' INT TERM EXIT

npm run dev:api &
npm run dev:web &

wait
