# Dockerfile for production

# Stage 1: Build the application
FROM node:22-alpine AS builder

# Set the working directory
WORKDIR /app

# Get git commit hash for build info
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application with build info
ENV NEXT_PUBLIC_GIT_COMMIT=${GIT_COMMIT}
ENV NEXT_PUBLIC_BUILD_DATE=${BUILD_DATE}
RUN npm run build

# Stage 2: Create the production image
FROM node:22-alpine

# Set the working directory
WORKDIR /app

# Copy the built application from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Install production dependencies
RUN npm install --only=production

# Expose the port for the Next.js server
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
