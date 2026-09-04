import { chromium } from 'playwright';
import fs from 'fs';
const OUT='/tmp/claude-0/-home-user-Zaya/5351c2b6-788c-50b2-b2fa-d6a775b69327/scratchpad/critique-b';
fs.mkdirSync(OUT,{recursive:true});
const PDF=fs.readFileSync('/home/user/Zaya/tests/fixtures/sample-outline.pdf');
const URL='http://127.0.0.1:8080/index.html?pdf=https://example.com/sample.pdf';

const VPS=[
 {n:'1280x720',w:1280,h:720},
 {n:'1024x768',w:1024,h:768},
 {n:'768x1024T',w:768,h:1024,touch:true},
 {n:'412x915',w:412,h:915,touch:true,mob:true},
 {n:'390x844',w:390,h:844,touch:true,mob:true},
 {n:'360x780',w:360,h:780,touch:true,mob:true},
 {n:'320x568',w:320,h:568,touch:true,mob:true},
 {n:'780x360L',w:780,h:360,touch:true,mob:true},
];

const PROBE = `(() => {
 const vw=innerWidth, vh=innerHeight;
 const sel=(el)=>{ if(!el) return '?'; let s=el.tagName.toLowerCase(); if(el.id) s+='#'+el.id; else if(el.className&&typeof el.className==='string') s+='.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'); return s; };
 const vis=(el)=>{ const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0) return false; const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
 const onScreen=(r)=> r.bottom>0&&r.right>0&&r.top<vh&&r.left<vw;
 const out={vw,vh,scrollW:document.documentElement.scrollWidth,overflowX:document.documentElement.scrollWidth>vw};
 // oversized
 out.oversized=[];
 for(const el of document.querySelectorAll('body *')){ if(!vis(el))continue; const r=el.getBoundingClientRect(); if(!onScreen(r))continue; if(r.right>vw+1||r.left<-1){ out.oversized.push({s:sel(el),l:Math.round(r.left),r:Math.round(r.right),w:Math.round(r.width)}); } }
 out.oversized=out.oversized.slice(0,12);
 // overlaps
 const names=['.app-header','#customControlBar','#unifiedPanel','#navigatorDrawer','#flipbookContainer canvas','#customMoreMenu','.tm-modal-content'];
 const boxes=names.map(n=>{const e=document.querySelector(n); return (e&&vis(e))?{n,r:e.getBoundingClientRect()}:null}).filter(Boolean);
 out.overlaps=[];
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i].r,b=boxes[j].r;const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left);const oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top); if(ox>1&&oy>1) out.overlaps.push({a:boxes[i].n,b:boxes[j].n,ox:Math.round(ox),oy:Math.round(oy)});}
 // touch targets
 out.small=[];
 for(const el of document.querySelectorAll('button,a,input,[role=tab],[role=button]')){ if(!vis(el))continue; const r=el.getBoundingClientRect(); if(!onScreen(r))continue; if(el.type==='hidden')continue; if(r.width<44||r.height<44) out.small.push({s:sel(el),w:+r.width.toFixed(1),h:+r.height.toFixed(1)});}
 // font size
 out.smallFont=[];
 const seen=new Set();
 for(const el of document.querySelectorAll('body *')){ if(!vis(el))continue; let t=''; for(const n of el.childNodes) if(n.nodeType===3) t+=n.textContent; t=t.trim(); if(!t)continue; const r=el.getBoundingClientRect(); if(!onScreen(r))continue; const fs=parseFloat(getComputedStyle(el).fontSize); if(fs<12){ const k=sel(el)+'|'+fs; if(!seen.has(k)){seen.add(k); out.smallFont.push({s:sel(el),fs,t:t.slice(0,24)});} } }
 return out;
})()`;

const CONTRAST = `(() => {
 const vw=innerWidth,vh=innerHeight;
 const sel=(el)=>{let s=el.tagName.toLowerCase(); if(el.id)s+='#'+el.id; else if(el.className&&typeof el.className==='string')s+='.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'); return s;};
 const vis=(el)=>{const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0)return false; const r=el.getBoundingClientRect(); return r.width>0&&r.height>0&&r.bottom>0&&r.top<vh&&r.right>0&&r.left<vw;};
 const parse=(c)=>{const m=c.match(/[\\d.]+/g); if(!m)return null; const a=m.length>3?parseFloat(m[3]):1; return [+m[0],+m[1],+m[2],a];};
 const lum=(c)=>{const f=c.slice(0,3).map(v=>{v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}); return .2126*f[0]+.7152*f[1]+.0722*f[2];};
 const blend=(fg,bg)=>{const a=fg[3]; return [fg[0]*a+bg[0]*(1-a),fg[1]*a+bg[1]*(1-a),fg[2]*a+bg[2]*(1-a),1];};
 const effBg=(el)=>{let n=el, acc=null; while(n&&n.nodeType===1){const c=parse(getComputedStyle(n).backgroundColor); if(c&&c[3]>0){ acc=acc?blend(acc,c):c; if(acc[3]>=0.99) return acc;} n=n.parentElement;} return acc||[255,255,255,1];};
 const res=[]; const seen=new Set();
 for(const el of document.querySelectorAll('body *')){ if(!vis(el))continue; let t=''; for(const n of el.childNodes) if(n.nodeType===3)t+=n.textContent; t=t.trim(); if(!t)continue;
  const cs=getComputedStyle(el); const fg0=parse(cs.color); if(!fg0)continue; const bg=effBg(el); const fg=fg0[3]<1?blend(fg0,bg):fg0;
  const L1=lum(fg),L2=lum(bg); const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
  const fsz=parseFloat(cs.fontSize); const bold=parseInt(cs.fontWeight)>=700; const large=fsz>=24||(fsz>=18.66&&bold); const need=large?3:4.5;
  if(ratio<need){ const k=sel(el)+'|'+ratio.toFixed(2); if(seen.has(k))continue; seen.add(k);
   res.push({s:sel(el),r:+ratio.toFixed(2),need,fs:fsz,t:t.slice(0,20),fg:cs.color,bg:'rgb('+bg.slice(0,3).map(Math.round).join(',')+')'});}}
 return res.sort((a,b)=>a.r-b.r).slice(0,25);
})()`;

const results={};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

async function mkPage(vp){
  const ctx=await browser.newContext({viewport:{width:vp.w,height:vp.h},isMobile:!!vp.mob,hasTouch:!!vp.touch,deviceScaleFactor:1});
  await ctx.route('**/*',route=>{const u=route.request().url();
    if(u.startsWith('http://127.0.0.1:8080')) return route.continue();
    if(/\.pdf($|\?)|ufs\.sh\//.test(u)) return route.fulfill({status:200,contentType:'application/pdf',body:PDF});
    return route.fulfill({status:204,body:''});});
  const page=await ctx.newPage();
  const errs=[];
  page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,160));});
  page.on('pageerror',e=>errs.push('pageerror: '+String(e.message).slice(0,160)));
  return {ctx,page,errs};
}

const STATES=[
 ['base',async p=>{}],
 ['panel-document',async p=>{await p.click('#toggleUnifiedPanelBtn'); await p.click('#panelTabDocument');}],
 ['panel-notes',async p=>{await p.click('#toggleUnifiedPanelBtn'); await p.click('#panelTabNotes');}],
 ['panel-media',async p=>{await p.click('#toggleUnifiedPanelBtn'); await p.click('#panelTabMedia');}],
 ['panel-settings',async p=>{await p.click('#toggleUnifiedPanelBtn'); await p.click('#panelTabSettings');}],
 ['nav-thumbs',async p=>{await p.click('#customThumbnailBtn');}],
 ['nav-outline',async p=>{await p.click('#customThumbnailBtn'); await p.click('#navTabOutline');}],
 ['nav-search',async p=>{await p.click('#customThumbnailBtn'); await p.click('#navTabSearch'); await p.fill('.df-search-input','flipbooks');}],
 ['theme-selector',async p=>{await p.click('#openThemeSelectorBtn');}],
 ['more-menu',async p=>{await p.click('#customMoreBtn');}],
];

for(const vp of VPS){
  const {ctx,page,errs}=await mkPage(vp);
  const R={errors:[],states:{}};
  try{
    await page.goto(URL,{waitUntil:'load',timeout:60000});
    await page.waitForTimeout(6000);
    for(const [name,fn] of STATES){
      try{ await fn(page); await page.waitForTimeout(900); }
      catch(e){ R.states[name]={stateError:String(e.message).split('\n')[0].slice(0,120)}; 
        try{await page.keyboard.press('Escape');}catch{}; continue; }
      R.states[name]=await page.evaluate(PROBE);
      if(name==='base'&&(vp.n==='1280x720'||vp.n==='390x844')){
        try{ await page.screenshot({path:`${OUT}/${vp.n}-base.png`}); }catch{}
      }
      // close
      try{ await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        await page.evaluate(()=>{document.querySelectorAll('#unifiedPanel.open,#navigatorDrawer.open,#customMoreMenu.open').forEach(e=>e.classList.remove('open'));});
      }catch{}
    }
    R.contrast={};
    R.contrast.default=await page.evaluate(CONTRAST);
    if(vp.n==='1280x720'||vp.n==='390x844'){
      for(const t of ['light','nord']){
        try{ await page.evaluate(th=>window.themeManager&&window.themeManager.setTheme(th),t); await page.waitForTimeout(700);
          R.contrast[t]=await page.evaluate(CONTRAST);}catch(e){R.contrast[t]='ERR '+e.message.slice(0,80);}
      }
    }
  }catch(e){ R.fatal=String(e.message).slice(0,200); }
  R.errors=[...new Set(errs)].slice(0,15);
  results[vp.n]=R;
  await ctx.close();
  console.error('done',vp.n);
}
await browser.close();
fs.writeFileSync(`${OUT}/results.json`,JSON.stringify(results,null,1));
console.log('OK');
