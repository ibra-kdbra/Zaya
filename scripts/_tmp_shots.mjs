import { chromium } from '@playwright/test';
import fs from 'fs';
const OUT='/tmp/claude-0/-home-user-Zaya/5351c2b6-788c-50b2-b2fa-d6a775b69327/scratchpad/critique-a/';
const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PDF=fs.readFileSync('/home/user/Zaya/tests/fixtures/sample-outline.pdf');
const PDF2=fs.readFileSync('/home/user/Zaya/tests/fixtures/sample.pdf');
const URL='http://127.0.0.1:8080/index.html?pdf=https://example.com/sample.pdf';
const browser=await chromium.launch({executablePath:EXE});

async function mk(vp, opts={}){
  const ctx=await browser.newContext({viewport:vp, deviceScaleFactor:opts.dpr||1, isMobile:!!opts.mobile, hasTouch:!!opts.touch});
  const page=await ctx.newPage();
  await page.route('**/*', async r=>{
    const u=r.request().url();
    if(u.startsWith('http://127.0.0.1:8080')) return r.continue();
    if(/\.pdf($|\?)/.test(u)||/ufs\.sh\//.test(u)) return r.fulfill({status:200,contentType:'application/pdf',headers:{'Access-Control-Allow-Origin':'*'},body:opts.empty?PDF2:PDF});
    return r.fulfill({status:204,body:''});
  });
  return {ctx,page};
}
async function ready(page){
  await page.waitForTimeout(300);
  try{ await page.waitForSelector('.page, canvas', {timeout:15000}); }catch{}
  await page.waitForTimeout(2500);
}
const shot=(p,n)=>p.screenshot({path:OUT+n+'.png'});
const reveal=async(page,h)=>{await page.mouse.move(page.viewportSize().width/2,(h||page.viewportSize().height)-5);await page.waitForTimeout(700);};

// desktop
{
  const {page}=await mk({width:1280,height:720});
  await page.goto(URL); await ready(page);
  await page.mouse.move(640,715); await page.waitForTimeout(900);
  await shot(page,'d-base');
  await page.click('#toggleUnifiedPanelBtn'); await page.waitForTimeout(800); await shot(page,'d-panel-document');
  for(const t of ['Notes','Media','Settings']){ await page.click('#panelTab'+t); await page.waitForTimeout(600); await shot(page,'d-panel-'+t.toLowerCase()); }
  await page.click('#toggleUnifiedPanelBtn'); await page.waitForTimeout(600);
  await reveal(page); await page.click('#customThumbnailBtn',{force:true}); await page.waitForTimeout(1800); await shot(page,'d-nav-thumbs');
  await page.click('#navTabOutline'); await page.waitForTimeout(700); await shot(page,'d-nav-outline');
  await page.click('#navTabSearch'); await page.waitForTimeout(500);
  await page.fill('.df-search-input','flipbooks'); await page.keyboard.press('Enter'); await page.waitForTimeout(2500); await shot(page,'d-nav-search');
  await reveal(page); await page.click('#customThumbnailBtn',{force:true}); await page.waitForTimeout(600);
  await page.click('#toggleUnifiedPanelBtn'); await page.waitForTimeout(400);
  await page.click('#panelTabSettings'); await page.waitForTimeout(300);
  await page.click('#openThemeSelectorBtn'); await page.waitForTimeout(900); await shot(page,'d-themes');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.evaluate(()=>window.themeManager&&window.themeManager.setTheme('light')); await page.waitForTimeout(800); await shot(page,'d-light');
  await page.evaluate(()=>window.themeManager&&window.themeManager.setTheme('nord')); await page.waitForTimeout(800); await shot(page,'d-nord');
  await page.evaluate(()=>window.themeManager&&window.themeManager.setTheme('default')); await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.mouse.move(640,715); await page.waitForTimeout(600);
  await page.click('#customMoreBtn',{force:true}); await page.waitForTimeout(700); await shot(page,'d-more');
  // long name
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{document.querySelectorAll('[data-pdf-info]').forEach(e=>e.textContent='Annual Report 2025 Consolidated Financial Statements And Notes Vol II'.padEnd(90,'x'));});
  await page.mouse.move(640,715); await page.waitForTimeout(600); await shot(page,'d-longname');
  await page.context().close();
}
console.log('desktop done');
await browser.close();
