import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createApp} from '../services/web/server.mjs';
const fixture=await mkdtemp(path.join(os.tmpdir(),'vsync-website-ui-')),checks=[],errors=[];
const bytes=Buffer.from('MZ-fixture-not-a-real-installer'),filename='Vsync-Client-Setup-0.1.2.exe';
await writeFile(path.join(fixture,filename),bytes);await writeFile(path.join(fixture,'release.json'),JSON.stringify({version:'0.1.2',filename,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),notes:['Fixture'],signed:false,windowsValidated:false}));
const server=await createApp({releasesDir:fixture});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.VSYNC_TEST_BROWSER||undefined,args:process.env.VSYNC_TEST_BROWSER?['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process','--disable-software-rasterizer']:[]});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));const shot=async name=>{if(process.env.VSYNC_TEST_SCREENSHOTS){await mkdir(process.env.VSYNC_TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.VSYNC_TEST_SCREENSHOTS,name+'.png'),fullPage:true});}};
try{
 await page.goto(url);await page.getByRole('heading',{name:'Seu Minecraft. No seu ritmo.'}).waitFor();await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('website-desktop');checks.push('Site desktop, fontes e imagens carregadas sem overflow');
 await page.getByRole('tab',{name:'Qualidade',exact:true}).click();assert.equal(await page.locator('#preset-render').textContent(),'16 chunks');assert.equal(await page.locator('#preset-ram').textContent(),'6 GB');await page.getByRole('tab',{name:'Qualidade',exact:true}).press('Home');assert.equal(await page.getByRole('tab',{name:'Máximo FPS',exact:true}).getAttribute('aria-selected'),'true');checks.push('Demonstração dos presets por clique e teclado');
 await page.locator('.faq-list summary').first().click();assert.equal(await page.locator('.faq-list details').first().getAttribute('open'),'');await page.getByRole('button',{name:'Privacidade',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});checks.push('FAQ e privacidade acessíveis');
 await page.locator('#download-windows[aria-disabled=false]').waitFor();const pending=page.waitForEvent('download');await page.locator('#download-windows').click();const download=await pending;assert.equal(download.suggestedFilename(),filename);checks.push('Botão baixa arquivo da rota real com fixture identificada');
 for(const size of [{width:768,height:1024},{width:390,height:844}]){await page.setViewportSize(size);await page.goto(url);await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(size.width===390){await page.getByRole('button',{name:'Abrir menu'}).click();await page.locator('#mobile-nav').getByRole('link',{name:'Desempenho',exact:true}).click();assert.equal(await page.locator('#mobile-nav').isVisible(),false);await page.evaluate(()=>scrollTo(0,0));}await shot('website-'+size.width);checks.push('Layout responsivo '+size.width+' px');}
 assert.deepEqual(errors,[]);const result={passed:checks.length,checks,rendererErrors:errors,downloadFixture:true};await mkdir('test-results',{recursive:true});await writeFile('test-results/website-interface.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(fixture,{recursive:true,force:true});}
