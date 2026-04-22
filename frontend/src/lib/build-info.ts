export const BUILD_INFO = {
  commit: import.meta.env.VITE_GIT_COMMIT || "unknown",
  buildDate: import.meta.env.VITE_BUILD_DATE || new Date().toISOString(),
  version: import.meta.env.VITE_VERSION || "1.0.0",
}