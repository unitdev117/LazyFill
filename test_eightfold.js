const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  console.log('Loading Eightfold AI...');
  await page.goto('https://micron.eightfold.ai/careers/apply?pid=40777557&domain=micron.com&hl=en', { waitUntil: 'networkidle2' });
  
  // Wait specifically for custom inputs to load
  await new Promise(r => setTimeout(r, 4000));
  
  // Dump raw HTML temporarily to see structure
  const html = await page.content();
  fs.writeFileSync('eightfold_dump.html', html);
  
  const scannerCode = fs.readFileSync(path.resolve('d:/Code/Projects/LazyFill/frontend/scanner.js'), 'utf8');
  
  // Polyfill extension env
  await page.evaluate(() => {
    window.chrome = {
      runtime: {
        onMessage: {
          addListener: () => {}
        }
      }
    };
  });
  
  console.log('Injecting scanner...');
  await page.evaluate(scannerCode);
  
  const scanRes = await page.evaluate(async () => {
    // Eightfold uses heavily nested shadow roots or custom components
    return window.__lazyFillScanner.performScan();
  });
  
  console.log('SCAN RESULT:', JSON.stringify(scanRes, null, 2));
  
  await browser.close();
})();
