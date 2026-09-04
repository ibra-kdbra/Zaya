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
const ready=async p=>{await p.waitForTimeout(300);try{await p.waitForSelector('.page, canvas',{timeout:15000});}catch{} await p.waitForTimeout(2500);};
const shot=(p,n)=>p.screenshot({path:OUT+n+'.png'});
const tap=async(p,sel)=>{await p.click(sel,{force:true});await p.waitForTimeout(800);};

async function device(name,vp,opts){
  const {ctx,page}=await mk(vp,opts);
  await page.goto(URL); await ready(page);
  await shot(page,name+'-base');
  await tap(page,'#toggleUnifiedPanelBtn'); await shot(page,name+'-panel-document');
  for(const t of ['Notes','Media','Settings']){ await tap(page,'#panelTab'+t); await shot(page,name+'-panel-'+t.toLowerCase()); }
  await tap(page,'#openThemeSelectorBtn'); await shot(page,name+'-themes');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.evaluate(()=>document.querySelectorAll('.unified-panel.open, .unified-panel').forEach(e=>e.classList.remove('open')));
  await page.waitForTimeout(500);
  await tap(page,'#customThumbnailBtn'); await page.waitForTimeout(1200); await shot(page,name+'-nav-thumbs');
  await tap(page,'#navTabOutline'); await shot(page,name+'-nav-outline');
  await tap(page,'#navTabSearch');
  await page.fill('.df-search-input','flipbooks'); await page.keyboard.press('Enter'); await page.waitForTimeout(2500); await shot(page,name+'-nav-search');
  await tap(page,'#customThumbnailBtn');
  await tap(page,'#customMoreBtn'); await shot(page,name+'-more');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.evaluate(()=>window.themeManager&&window.themeManager.setTheme('light')); await page.waitForTimeout(700); await shot(page,name+'-light');
  await page.evaluate(()=>window.themeManager&&window.themeManager.setTheme('nord')); await page.waitForTimeout(700); await shot(page,name+'-nord');
  await page.evaluate(()=>window.themeManager&&window.themeManager.setTheme('default')); await page.waitForTimeout(400);
  await page.evaluate(()=>{document.querySelectorAll('[data-pdf-info]').forEach(e=>e.textContent='Annual Report 2025 Consolidated Financial Statements And Notes Volume II Appendix'.slice(0,90));});
  await page.waitForTimeout(400); await shot(page,name+'-longname');
  await ctx.close();
}
await device('t',{width:768,height:1024},{touch:true});
await device('p412',{width:412,height:915},{mobile:true,touch:true,dpr:2});
await device('p360',{width:360,height:780},{mobile:true,touch:true,dpr:2});
// landscape phone
{
  const {ctx,page}=await mk({width:780,height:360},{mobile:true,touch:true,dpr:2});
  await page.goto(URL); await ready(page); await shot(page,'pland-base');
  await page.click('#toggleUnifiedPanelBtn',{force:true}); await page.waitForTimeout(800); await shot(page,'pland-panel');
  await ctx.close();
}
// loading state
{
  const {ctx,page}=await mk({width:412,height:915},{mobile:true,touch:true,dpr:2});
  page.goto(URL).catch(()=>{}); await page.waitForTimeout(320); await shot(page,'p412-loading'); await ctx.close();
}
{
  const {ctx,page}=await mk({width:1280,height:720});
  page.goto(URL).catch(()=>{}); await page.waitForTimeout(320); await shot(page,'d-loading'); await ctx.close();
}
// empty outline doc
{
  const {ctx,page}=await mk({width:1280,height:720},{empty:true});
  await page.goto(URL); await ready(page);
  await page.mouse.move(640,715); await page.waitForTimeout(700);
  await page.click('#customThumbnailBtn',{force:true}); await page.waitForTimeout(1500);
  await page.click('#navTabOutline',{force:true}); await page.waitForTimeout(900); await shot(page,'d-empty-outline');
  await page.click('#navTabSearch',{force:true}); await page.waitForTimeout(500);
  await page.fill('.df-search-input','zzzqqq'); await page.keyboard.press('Enter'); await page.waitForTimeout(2500); await shot(page,'d-empty-search');
  await ctx.close();
}
{
  const {ctx,page}=await mk({width:412,height:915},{mobile:true,touch:true,dpr:2,empty:true});
  await page.goto(URL); await ready(page);
  await page.click('#customThumbnailBtn',{force:true}); await page.waitForTimeout(1500);
  await page.click('#navTabOutline',{force:true}); await page.waitForTimeout(900); await shot(page,'p412-empty-outline');
  await ctx.close();
}
// error state: pdf fails
{
  const ctx=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await ctx.newPage();
  await page.route('**/*', async r=>{const u=r.request().url(); if(u.startsWith('http://127.0.0.1:8080'))return r.continue(); return r.fulfill({status:404,body:'no'});});
  await page.goto(URL); await page.waitForTimeout(6000); await shot(page,'p412-error');
  await ctx.close();
}
// changelog
for(const [n,vp] of [['cl-1280',{width:1280,height:900}],['cl-360',{width:360,height:780}]]){
  const ctx=await browser.newContext({viewport:vp,deviceScaleFactor:n==='cl-360'?2:1,isMobile:n==='cl-360',hasTouch:n==='cl-360'});
  const page=await ctx.newPage();
  await page.route('**/*', async r=>{const u=r.request().url(); if(u.startsWith('http://127.0.0.1:8080'))return r.continue(); return r.fulfill({status:204,body:''});});
  await page.goto('http://127.0.0.1:8080/changelog.html'); await page.waitForTimeout(2500); await shot(page,n);
  await page.evaluate(()=>window.scrollBy(0,900)); await page.waitForTimeout(600); await shot(page,n+'-scrolled');
  await ctx.close();
}
console.log('done');
await browser.close();
