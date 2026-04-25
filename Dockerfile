# Stage 1: Build the Go application
FROM golang:1.24-alpine AS backend

ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOARCH=amd64

WORKDIR /app

COPY backend/go.mod backend/go.sum ./
RUN go mod download && go mod verify

COPY backend/ ./
RUN go build -v -ldflags="-s -w" -o /app/main .

# Stage 2: Build the frontend
FROM node:22-alpine AS frontend

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Final stage: Combine backend and frontend
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata postgresql-client wget

RUN addgroup -S app && adduser -S -G app app

WORKDIR /app

COPY --from=backend /app/main /app/main
COPY --from=frontend /app/dist ./frontend/dist

RUN chown -R app:app /app

EXPOSE 8080

ENV FRONTEND_DIST=/app/frontend/dist

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["/app/main"]