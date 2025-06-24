const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { spawn } = require('child_process');

const FRONTEND_PORT = 5173; // Assuming Vite's default port
const BASE_URL = `http://localhost:${FRONTEND_PORT}`;
let devServerProcess;

// 2. Define WebDriver capabilities
function getChromeOptions() {
  let options = new chrome.Options();
  // Run headless if an environment variable CI is set, or if explicitly desired
  if (process.env.CI || process.env.HEADLESS === 'true') {
    options.addArguments('--headless');
  }
  options.addArguments('--no-sandbox'); // Often needed in CI environments
  options.addArguments('--disable-dev-shm-usage'); // Overcomes limited resource problems
  options.addArguments('--disable-gpu'); // Recommended for headless
  options.addArguments('window-size=1920,1080'); // Set a reasonable window size
  return options;
}

// 3. Function to start the dev server
function startDevServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting dev server with mock API...');
    // Assuming this script is in 'frontend/', so 'npm run dev:mock' runs in the correct directory.
    devServerProcess = spawn('npm', ['run', 'dev:mock'], {
      // if the script is in project root, use cwd: 'frontend'
      // if the script is in frontend/, then cwd is not needed or can be '.'
      cwd: '.',
      stdio: ['ignore', 'pipe', 'pipe'], // stdin, stdout, stderr
      shell: true // Use shell to correctly interpret 'npm run dev:mock' on different OS
    });

    devServerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[DevServer STDOUT]: ${output.trim()}`);
      if (output.includes(`Local:  http://localhost:${FRONTEND_PORT}`)) {
        console.log('Dev server is ready.');
        resolve(devServerProcess);
      }
    });

    devServerProcess.stderr.on('data', (data) => {
      console.error(`[DevServer STDERR]: ${data.toString().trim()}`);
    });

    devServerProcess.on('error', (err) => {
      console.error('Failed to start dev server process.', err);
      reject(err);
    });

    devServerProcess.on('close', (code) => {
      if (code !== 0 && code !== null) { // null if killed by us
        console.log(`Dev server process exited with code ${code}`);
        // Potentially reject here if it closes unexpectedly before resolving
      }
    });
  });
}

// 4. Main test logic (async function)
async function mainTest() {
  let driver;

  try {
    console.log('Starting tests...');
    devServerProcess = await startDevServer();

    console.log('Initializing WebDriver...');
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(getChromeOptions())
      .build();
    console.log('WebDriver initialized.');

    // --- Test Cases ---

    // Navigate to home/login page
    console.log(`Navigating to ${BASE_URL}/ ...`);
    await driver.get(BASE_URL + '/');
    await driver.wait(until.urlContains('/login'), 10000); // Assuming redirect to /login
    console.log('Successfully navigated to login page.');

    // Basic interaction/verification on Login Page
    // Assuming there's a prominent "Login with Google" button or similar
    await driver.wait(until.elementLocated(By.css('a[href*="/api/auth/google"]')), 10000);
    const loginButton = await driver.findElement(By.css('a[href*="/api/auth/google"]'));
    if(await loginButton.isDisplayed()){
        console.log('Login button found and displayed.');
    } else {
        throw new Error('Login button not displayed');
    }


    // Since getMe is mocked, navigating to a protected route should show mock user data.
    // No actual login click needed for this test if VITE_MOCK_API correctly mocks /me
    console.log(`Navigating to ${BASE_URL}/dashboard ...`);
    await driver.get(BASE_URL + '/dashboard');

    // Verify Dashboard - check for mock username
    // Assuming username is displayed in an element with id 'user-greeting' or a specific class
    // For now, let's look for the text 'mockuser' which is in our mock getMe
    await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'mockuser')]")), 10000);
    console.log('Dashboard loaded, mock username "mockuser" found.');

    // Navigate to Database List
    console.log(`Navigating to ${BASE_URL}/databases ...`);
    await driver.get(BASE_URL + '/databases');

    // Verify Database List
    await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'Mock DB 1')]")), 10000);
    console.log('Database list page loaded.');

    const db1Element = await driver.findElement(By.xpath("//*[contains(text(), 'Mock DB 1')]"));
    const db2Element = await driver.findElement(By.xpath("//*[contains(text(), 'Mock DB 2')]"));

    if (await db1Element.isDisplayed() && await db2Element.isDisplayed()) {
        console.log('Mock DB 1 and Mock DB 2 names found on the page.');
    } else {
        throw new Error('Mock database names not found or not displayed.');
    }

    // Navigate to a Database Detail page for db1
    console.log(`Navigating to ${BASE_URL}/databases/db1 ...`);
    // We can click the link or navigate directly. Direct navigation is simpler here.
    await driver.get(BASE_URL + '/databases/db1');

    // Verify Database Detail page
    await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'Mock DB 1')]")), 10000); // Name of DB
    await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'user_read')]")), 10000); // Mock PG User
    await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'user_write')]")), 10000); // Mock PG User
    console.log('Database detail page for "Mock DB 1" loaded and mock user "user_read" found.');


    // Example: Navigate to create database page, check for a form field
    console.log(`Navigating to ${BASE_URL}/databases/create ...`);
    await driver.get(BASE_URL + '/databases/create');
    await driver.wait(until.elementLocated(By.css('input[name="name"]')), 10000);
    console.log('Create database page loaded, input field for name found.');


    console.log('All tests passed successfully!');

  } catch (error) {
    console.error('Test failed:', error);
    // Take a screenshot on failure
    if (driver) {
        try {
            const screenshot = await driver.takeScreenshot();
            require('fs').writeFileSync('error_screenshot.png', screenshot, 'base64');
            console.log('Screenshot saved as error_screenshot.png');
        } catch (ssError) {
            console.error('Failed to take screenshot:', ssError);
        }
    }
    throw error; // Re-throw to ensure script exits with error code
  } finally {
    // Cleanup
    if (driver) {
      console.log('Quitting WebDriver...');
      await driver.quit();
      console.log('WebDriver quit.');
    }
    if (devServerProcess) {
      console.log('Killing dev server process...');
      const killed = devServerProcess.kill();
      if (killed) {
        console.log('Dev server process killed.');
      } else {
        console.error('Failed to kill dev server process. It might have already exited.');
      }
    }
  }
}

// 5. Execute the main test logic
mainTest().catch((err) => {
  console.error("Main test execution failed:", err);
  process.exit(1); // Ensure the script exits with a non-zero code on error
});
