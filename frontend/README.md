# Frontend Development

This document provides instructions for developing and testing the frontend application.

## Standard Development

To run the standard development server, which typically connects to a live backend API:

```bash
npm run dev
```

## Development with Mock Backend

For isolated frontend development or when a live backend is unavailable, you can run the development server with a mock backend. This mode simulates API responses using predefined mock data, allowing you to test UI components and flows without actual backend operations.

To run the development server with the mock backend enabled:

```bash
npm run dev:mock
```
The mock API behavior is defined in `src/lib/api.ts` and enabled when the `VITE_MOCK_API` environment variable is set to `true`.

## Rendering Tests

Rendering tests are implemented using `selenium-webdriver` to automate browser interactions and verify that the UI renders correctly with mock data. These tests provide a way to catch visual regressions or issues in component rendering.

**Prerequisites:**
*   **ChromeDriver**: You must have ChromeDriver installed and available in your system's PATH. The version of ChromeDriver should correspond to the version of Google Chrome installed on your system.

**Running the Tests:**
The rendering test script (`frontend/test-rendering.js`) will automatically start the development server with the mock backend (`npm run dev:mock`) and then execute a series of UI interactions and verifications. It will also shut down the server when done.

To run the rendering tests:

```bash
node frontend/test-rendering.js
```
Test output, including successes or failures, will be displayed in the console. On failure, a screenshot named `error_screenshot.png` may be generated in the `frontend` directory.
