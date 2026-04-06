const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.goto('https://micron.eightfold.ai/careers/apply?pid=40777557&domain=micron.com&hl=en', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000));
  
  const scannerCode = fs.readFileSync(path.resolve('d:/Code/Projects/LazyFill/frontend/scanner.js'), 'utf8');
  
  await page.evaluate(() => {
    window.chrome = { runtime: { onMessage: { addListener: () => {} } } };
  });
  
  await page.evaluate(scannerCode);
  
  const scanRes = await page.evaluate(async () => {
    return window.__lazyFillScanner.performScan();
  });
  
  console.log('--- FOUND FIELDS ---');
  // Log a subset to check the deep paths
  if (scanRes && scanRes.length > 0) {
     scanRes.slice(0, 5).forEach(f => {
       console.log(`\nField: ${f.id} (${f.type})`);
       console.log(`Fallback Label: ${f.label}`);
       console.log(`DOM Path: ${f.domPath}`);
       console.log(`Surrounding Text: "${f.surroundingText}"`);
     });
     console.log(`\nTotal fields detected: ${scanRes.length}`);
  } else {
     console.log('No fields detected.');
  }
  
  await browser.close();
})();
