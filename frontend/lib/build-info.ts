export const BUILD_INFO = {
  commit: process.env.NEXT_PUBLIC_GIT_COMMIT || "unknown",
  buildDate: process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString(),
  version: process.env.NEXT_PUBLIC_VERSION || "1.0.0",
}