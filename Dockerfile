# syntax=docker/dockerfile:1

# Overlays dispatcharr-easy's built frontend onto Dispatcharr's own published
# image. No frontend build stage here — CI builds dist/ before this step
# (see .github/workflows/release.yml), so this Dockerfile only needs to copy
# an already-built dist/ into place.

# Default mirrors COMPATIBLE_DISPATCHARR_VERSION's content (Docker can't read
# a file into an ARG default) — bump both together when that file changes.
# CI (.github/workflows/release.yml) always overrides this explicitly via
# --build-arg, so this default only matters for a plain local `docker build .`.
ARG DISPATCHARR_VERSION=0.28.2
FROM ghcr.io/dispatcharr/dispatcharr:${DISPATCHARR_VERSION}

# Clean out the base image's own bundled frontend before overlaying ours,
# so no stale hashed assets from Dispatcharr's own build linger alongside
# dispatcharr-easy's (matches upstream's own Dockerfile convention of
# `RUN rm -rf /app/frontend` before copying in a freshly built frontend).
RUN rm -rf /app/frontend/dist
COPY dist/ /app/frontend/dist/
