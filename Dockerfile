# Codeharness CLI — containerized deployment
# Installs the project from tarball (npm pack output). No source code enters the image.
FROM node:22-slim

ARG TARBALL=package.tgz

# System utilities for verification
RUN apt-get update && apt-get install -y --no-install-recommends curl jq \
  && rm -rf /var/lib/apt/lists/*

# Install the project from tarball (same as a user would)
COPY ${TARBALL} /tmp/${TARBALL}
RUN npm install -g /tmp/${TARBALL} && rm /tmp/${TARBALL} && npm cache clean --force

# Workspace owned by non-root user
RUN mkdir -p /workspace && chown node:node /workspace

# Non-root execution
USER node

WORKDIR /workspace

ENTRYPOINT ["codeharness"]
