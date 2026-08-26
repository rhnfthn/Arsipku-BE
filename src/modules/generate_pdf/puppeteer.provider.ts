// puppeteer.provider.ts
import * as puppeteer from 'puppeteer';
import { existsSync } from 'fs';

let browser: puppeteer.Browser | undefined;

// Try to find Chrome/Chromium executable across common OS paths
function findChromeExecutable(): string | undefined {
  const envPath =
    process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const possiblePaths = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',

    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',

    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : '',
  ].filter(Boolean);

  for (const chromePath of possiblePaths) {
    if (existsSync(chromePath)) {
      return chromePath;
    }
  }

  return undefined;
}

async function launchBrowser(): Promise<puppeteer.Browser> {
  const executablePath = findChromeExecutable();
  const launched = await puppeteer.launch({
    headless: true,
    executablePath: executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--disable-features=site-per-process',
    ],
  });

  launched.on('disconnected', () => {
    browser = undefined;
  });

  return launched;
}

export async function resetBrowser(): Promise<void> {
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    // noop
  } finally {
    browser = undefined;
  }
}

let browserPromise: Promise<puppeteer.Browser> | undefined;

export async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  // Dedupe launch: pemanggilan bersamaan (pre-warm + request pertama) berbagi
  // satu launch, tidak spawn browser kedua yang bocor.
  if (!browserPromise) {
    browserPromise = launchBrowser()
      .then((b) => {
        browser = b;
        browserPromise = undefined;
        return b;
      })
      .catch((err) => {
        browserPromise = undefined;
        throw err;
      });
  }
  return browserPromise;
}
