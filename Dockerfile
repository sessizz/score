# Ultra-lightweight Node.js Alpine Container
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Create data directory and permissions
RUN mkdir -p /app/data && chown -R node:node /app

# Copy application files
COPY --chown=node:node package.json ./
COPY --chown=node:node src/ ./src/

# Use non-root user for security
USER node

# Expose HTTP port
EXPOSE 3000

# Health check for Coolify / Docker
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Start zero-dependency high performance server
CMD ["node", "src/server.js"]
