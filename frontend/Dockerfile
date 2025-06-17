# Stage 1: Build the Svelte/Vite application
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package.json ./
# If you have a lock file, copy it too
# COPY package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Serve the static files with a lightweight server (e.g., Nginx)
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Remove default Nginx static assets
RUN rm -rf ./*

# Copy static assets from builder stage
COPY --from=builder /app/dist .

# Expose port (Vite's default is 5173 for dev, but build output is served on 80 by Nginx by default)
# The docker-compose.yml maps 5173 to this container's port 80 if Nginx is used.
# If using a different server for preview, adjust accordingly.
# For Vite preview server (which runs on 4173 by default if 5173 is in use):
# CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]
# EXPOSE 4173
# For Nginx:
EXPOSE 80

# Default command to start Nginx
CMD ["nginx", "-g", "daemon off;"]
