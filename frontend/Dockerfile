# Stage 1: Serve the static files with Nginx
FROM nginx:alpine

# Set working directory for Nginx
WORKDIR /usr/share/nginx/html

# Remove default Nginx static assets
RUN rm -rf ./*

# Copy static assets from our public directory
# The build context for this Dockerfile will be the 'frontend' directory.
# So, 'public' refers to 'frontend/public'.
COPY public/ .

# Expose port 80 (default for Nginx)
EXPOSE 80

# Default command to start Nginx
CMD ["nginx", "-g", "daemon off;"]
