// puppeteer.provider.ts
import * as puppeteer from 'puppeteer';

let browser: puppeteer.Browser;

export async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
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
