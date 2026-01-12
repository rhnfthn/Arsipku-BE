// puppeteer.provider.ts
import * as puppeteer from 'puppeteer';

let browser: puppeteer.Browser;

// Try to find Chrome executable on Windows
function findChromeExecutable(): string | undefined {
  const possiblePaths = [
    // Windows paths
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    // Let puppeteer find it automatically
    undefined,
  ];

  const fs = require('fs');
  for (const chromePath of possiblePaths) {
    if (chromePath && fs.existsSync(chromePath)) {
      return chromePath;
    }
  }
  return undefined;
}

export async function getBrowser() {
  if (!browser) {
    const executablePath = findChromeExecutable();
    
    browser = await puppeteer.launch({
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
        '--disable-features=site-per-process'
      ],
    });
  }
  return browser;
}
