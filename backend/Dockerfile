# Stage 1: Build the Go application
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum first to leverage Docker cache
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -v -o /app/server ./main.go

# Stage 2: Create the final lightweight image
FROM alpine:latest

WORKDIR /root/

COPY --from=builder /app/server .
COPY --from=builder /app/config.yml .  # Example, if you have a config file

# Expose port (same as in docker-compose.yml and main.go)
EXPOSE 8080

# Command to run the executable
CMD ["./server"]
