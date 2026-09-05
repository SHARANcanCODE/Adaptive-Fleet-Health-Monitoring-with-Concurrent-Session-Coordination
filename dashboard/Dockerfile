# Multi-stage build for Next.js dashboard

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

RUN apk add --no-cache libc6-compat

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time,
# so they must be passed in as build args (not just container env vars).
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:8080
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

# Build Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built files from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.js ./next.config.js
# Create public directory if it doesn't exist (Next.js doesn't require it)
RUN mkdir -p public || true

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["npm", "start"]

