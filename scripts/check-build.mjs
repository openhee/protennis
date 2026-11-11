import { readdir, access } from 'node:fs/promises';
const allowed=new Set(['login.html','login.css','login.js','session-ui.js','date.js']);
for(const file of await readdir('public'))if(!allowed.has(file))throw new Error(`Unexpected public asset: ${file}`);
for(const file of ['api/app.mjs','dist/coach.html','dist/coach-data.sample.js'])await access(file);
console.log('Build checked: only login assets are public; protected pages are served by the authentication handler.');
