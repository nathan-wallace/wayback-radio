if(!self.define){let e,s={};const i=(i,n)=>(i=new URL(i+".js",n).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(n,r)=>{const t=e||("document"in self?document.currentScript.src:"")||location.href;if(s[t])return;let c={};const d=e=>i(e,t),o={module:{uri:t},exports:c,require:d};s[t]=Promise.all(n.map((e=>o[e]||d(e)))).then((e=>(r(...e),c)))}}define(["./workbox-5ffe50d4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"assets/index-baf596bb.js",revision:null},{url:"assets/index-caf2ef0d.css",revision:null},{url:"index.html",revision:"d540b0f46032798a333e60dcbc3dcdcd"},{url:"registerSW.js",revision:"cca5d1f94aa25d3db511b295d236cbba"},{url:"manifest.webmanifest",revision:"9387b22df6cb656c5cd81c69a23bac4c"}],{}),e.cleanupOutdatedCaches(),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html")))}));
