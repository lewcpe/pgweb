# Stage 1: Build the Go application
FROM golang:1.22-alpine AS build

# Set necessary environment variables for building
ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOARCH=amd64

# Set the Current Working Directory inside the container
WORKDIR /app

# Install git for go mod download if private repos are involved (good practice)
# Alpine's go images usually have git. If not, uncomment:
# RUN apk add --no-cache git

# Copy go.mod and go.sum files to download dependencies
COPY go.mod go.sum ./
# verify is good practice, download alone is often sufficient if sources are trusted
RUN go mod download && go mod verify

# Copy the rest of the application source code
# This assumes the Dockerfile is in the 'backend' directory,
# and the context for the docker build is the 'backend' directory.
COPY . .

# Build the Go application
# Using -ldflags="-s -w" to strip debug information and reduce binary size.
# The build context is /app where all backend code is copied.
RUN go build -v -ldflags="-s -w" -o /app/main .

# Stage 2: Create the final lightweight image
FROM alpine:latest

# Install ca-certificates to trust TLS certificates from HTTPS services
RUN apk --no-cache add ca-certificates tzdata

# Set the Current Working Directory inside the container
WORKDIR /app

# Copy the compiled binary from the build stage
COPY --from=build /app/main /app/main

# Expose port 8080 to the outside world (as defined in main.go)
EXPOSE 8080

# Command to run the executable
# The actual .env file or environment variables should be provided at runtime.
CMD ["/app/main"]
