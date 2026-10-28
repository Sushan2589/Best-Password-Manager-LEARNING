import { chromium } from 'playwright';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
const out=resolve('portfolio-thumbnail');await mkdir(out,{recursive:true});
const asset=async(p,mime)=>`data:${mime};base64,${(await readFile(p)).toString('base64')}`;
const [vault,extension,logo,font]=await Promise.all([
asset('apps/web/public/images/product/vault-desktop.png','image/png'),
asset('apps/web/public/images/product/extension-vault.png','image/png'),
asset('apps/web/src/app/icon.svg','image/svg+xml'),
asset('apps/web/src/app/fonts/PlusJakartaSansVariable.woff2','font/woff2')]);
const browser=await chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:1600,height:832},deviceScaleFactor:1,colorScheme:'light',reducedMotion:'reduce'});
await page.goto('http://127.0.0.1:3046',{waitUntil:'networkidle',timeout:60000});
await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:out+'/homepage-screen.png'});
const homepage=await asset(out+'/homepage-screen.png','image/png');
const shared=`*{box-sizing:border-box}html,body{margin:0;width:1600px;height:832px;overflow:hidden}body{background:#efedf3;font-family:Jakarta,sans-serif}@font-face{font-family:Jakarta;src:url('${font}')} .screen{position:absolute;overflow:hidden;border:1px solid #d8d5df;border-radius:16px;box-shadow:0 20px 55px #25263d12}img{display:block}.canvas{width:1600px;height:832px;position:relative}.footer{position:absolute;bottom:26px;left:0;width:100%;text-align:center;color:#706b79;letter-spacing:4px;font-size:13px}`;
const homepageHTML=`<!doctype html><meta charset="utf-8"><style>${shared}body{background:#e9edef}.screen{left:60px;top:38px;width:1480px;height:732px;background:#fbfaf7}.screen img{width:1480px;height:770px;object-fit:cover;object-position:top}</style><div class="canvas"><div class="screen"><img src="${homepage}"></div><div class="footer">PASSWORD MANAGER · WEBSITE PREVIEW</div></div>`;
const productHTML=`<!doctype html><meta charset="utf-8"><style>${shared}body{background:#efedf3}.brand{position:absolute;left:94px;top:130px;display:flex;align-items:center;gap:16px;color:#25263d;font-size:26px;font-weight:650}.brand img{width:48px;height:48px}h1{position:absolute;left:94px;top:268px;margin:0;color:#25263d;font-size:68px;font-weight:650;line-height:1.14;letter-spacing:-3.5px}h1 span{color:#b84f3d}.sub{position:absolute;left:97px;top:480px;font-size:23px;line-height:1.6;color:#625f69}.chips{position:absolute;left:97px;top:613px;display:flex;gap:12px}.chip{border:1px solid #d7d2de;padding:12px 17px;border-radius:10px;font-size:16px;background:#fbfaf7;color:#545161}.vault{left:654px;top:100px;width:832px;height:613px;background:white}.vault img{width:100%;height:100%;object-fit:contain}.extension{left:1284px;top:380px;width:226px;height:339px;border-radius:17px;box-shadow:0 18px 50px #18214d22}.extension img{width:100%;height:100%}</style><div class="canvas"><div class="brand"><img src="${logo}">Password Manager</div><h1>Your passwords.<br><span>Off your mind.</span></h1><p class="sub">A calmer home for your logins.<br>On the web. In your browser.</p><div class="chips"><span class="chip">Encrypted vault</span><span class="chip">Chrome & Edge</span></div><div class="screen vault"><img src="${vault}"></div><div class="screen extension"><img src="${extension}"></div><div class="footer">REAL PRODUCT INTERFACE · SAMPLE ACCOUNTS</div></div>`;
await page.goto('about:blank');
for(const [name,html] of [['password-manager-website',homepageHTML],['password-manager-thumbnail',productHTML]]){
await writeFile(out+'/'+name+'.html',html);
await page.setContent(html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:out+'/'+name+'.png'});
await sharp(out+'/'+name+'.png').webp({quality:92}).toFile(out+'/'+name+'.webp');
await sharp(out+'/'+name+'.png').resize(414,216,{fit:'fill'}).png().toFile(out+'/'+name+'-card-preview.png');
}
console.log('Created 1600x832 PNG and WebP thumbnails plus 414x216 card previews in '+out);
}finally{await browser.close()}

