const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    await page.goto('https://micron.eightfold.ai/careers/apply?pid=40777557&domain=micron.com&hl=en', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 4000));
    
    const res = await page.evaluate(() => {
      let inputs = []; 
      function walk(root) { 
        root.querySelectorAll('input, select, textarea').forEach(i => {
          let label = '';
          const id = i.id;
          if (id) {
            try {
              const l = root.querySelector(`label[for="${CSS.escape(id)}"]`);
              if (l) label = l.innerText;
            } catch(e) {}
          }
          if (!label) {
            const p = i.closest('label');
            if (p) label = p.innerText;
          }
          inputs.push({tag: i.tagName, type: i.type, name: i.name, id: i.id, label});
        }); 
        root.querySelectorAll('*').forEach(el => { if(el.shadowRoot) walk(el.shadowRoot); }); 
      } 
      walk(document); 
      return inputs; 
    });
    
    console.log("DEEP FIND RESULTS:");
    console.log(JSON.stringify(res, null, 2));
    await browser.close();
  } catch (err) {
    console.error(err);
  }
})();
