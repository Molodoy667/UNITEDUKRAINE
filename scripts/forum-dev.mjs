import { createServer } from 'node:http';
import forum from '../api/forum.js';
import server from '../api/server.js';
import health from '../api/db-health.js';
import mail from '../api/forum-mail.js';
import account from '../api/account.js';
import roulette from '../api/roulette.js';
import forbes from '../api/forbes.js';
import admin from '../api/admin.js';
import site from '../api/site.js';
import launcher from '../api/launcher.js';
import render from '../api/render.js';
import media from '../api/media.js';

const port = Number(process.env.FORUM_DEV_PORT || 4174);
createServer(async (request, response) => {
  response.status = status => { response.statusCode = status; return response; };
  response.json = data => { response.setHeader('Content-Type','application/json; charset=utf-8'); response.end(JSON.stringify(data)); };
  try {
    const parsed=new URL(request.url,'http://localhost');
    const limit=parsed.pathname==='/api/admin'&&parsed.searchParams.get('action')==='site-image-upload'?3*1024*1024:100000;
    let size = 0; const chunks = [];
    for await (const chunk of request) { size += chunk.length; if (size > limit) { response.status(413).json({ message:'Request too large' }); return; } chunks.push(chunk); }
    if (size) request.body = Buffer.concat(chunks).toString('utf8');
    const route = new URL(request.url, 'http://localhost').pathname;
    if (route === '/api/forum') return await forum(request,response);
    if (route === '/api/server') return await server(request,response);
    if (route === '/online.json') return await server(request,response);
    if (route === '/projects/crmp/v2/info.xml') return await server(request,response);
    if (route === '/api/db-health') return await health(request,response);
    if (route === '/api/forum-mail') return await mail(request,response);
    if (route === '/api/account') return await account(request,response);
    if (route === '/api/roulette') return await roulette(request,response);
    if (route === '/api/forbes') return await forbes(request,response);
    if (route === '/api/admin') return await admin(request,response);
    if (route === '/api/site') return await site(request,response);
    if (route==='/api/knowledge-base'||route.startsWith('/api/knowledge-base/')) return await site(request,response);
    if (route === '/api/launcher') return await launcher(request,response);
    if (route === '/Project/info.json'||route==='/api/android-resources'||route.startsWith('/api/android-resources/')) return await launcher(request,response);
    if (route === '/api/render') return await render(request,response);
    if (route === '/api/media') return await media(request,response);
    response.status(404).json({ message:'Not found' });
  } catch { response.status(500).json({ message:'Local API error' }); }
}).listen(port,'127.0.0.1', () => console.log(`Local forum API: http://127.0.0.1:${port}`));
