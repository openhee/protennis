import { createServer } from 'node:http';
import { handle } from './api/app.mjs';
const port = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  try {
    const chunks=[]; let length=0;
    for await (const chunk of req) { length+=chunk.length; if(length>8192){res.writeHead(413);res.end();return} chunks.push(chunk); }
    const request=new Request(`http://localhost:${port}${req.url}`, { method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{}) });
    const result=await handle(request);
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  } catch {res.writeHead(500);res.end('Server error');}
}).listen(port,'127.0.0.1',()=>console.log(`Rally: http://localhost:${port}/login.html`));
