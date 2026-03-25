# Base image — pinned version for reproducibility
FROM node:22-slim

ARG TARBALL=package.tgz

# System utilities for verification
RUN apt-get update && apt-get install -y --no-install-recommends curl jq && rm -rf /var/lib/apt/lists/*

# Install project from tarball (black-box: no source code)
COPY ${TARBALL} /tmp/${TARBALL}
RUN npm install -g /tmp/${TARBALL} && rm /tmp/${TARBALL}

# Run as non-root user
USER node

WORKDIR /workspace
