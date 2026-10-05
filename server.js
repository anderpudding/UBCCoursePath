import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createCourseProvider,createGradeProvider,loadGradeSnapshots} from './lib/providers.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const courses=createCourseProvider({url:process.env.COURSE_FEED_URL,approved:process.env.COURSE_FEED_APPROVED==='true',token:process.env.COURSE_FEED_TOKEN,refreshMs:Math.max(30,Number(process.env.FEED_REFRESH_SECONDS)||60)*1000});
const grades=createGradeProvider({snapshots:await loadGradeSnapshots()});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  const json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if(req.method!=='GET'){json({error:'Method not allowed'},405);return;}
  try{
    const u=new URL(req.url,'http://localhost');
    if(u.pathname==='/api/courses'){
      const value=await courses.get();const term=value.feed.terms.find(t=>t.id===u.searchParams.get('term'))||(!u.searchParams.has('term')?value.feed.terms[0]:null);
      if(!term){json({error:'Unknown academic term'},404);return;}
      json({mode:value.mode,source:value.feed.source,fetchedAt:value.fetchedAt,error:value.error,terms:value.feed.terms.map(({id,label})=>({id,label})),term});return;
    }
    if(u.pathname==='/api/grade-sessions'){try{json({sessions:await grades.sessions(),cached:false});}catch{json({sessions:['2024W','2023W','2022W','2022S'],cached:true,error:'Session list unavailable; showing known historical sessions.'});}return;}
    if(u.pathname==='/api/grades'){
      const subject=u.searchParams.get('subject')||'',code=u.searchParams.get('code')||'',session=u.searchParams.get('session')||'';
      if(!/^[A-Z]{2,4}$/.test(subject)||!/^\d{3}[A-Z]?$/.test(code)||!/^\d{4}[WS]$/.test(session)){json({error:'Invalid grade query'},400);return;}
      json(await grades.grades(subject,code,session));return;
    }
    if(u.pathname.startsWith('/api/')){json({error:'Not found'},404);return;}
    const files={'/':'public/index.html','/index.html':'public/index.html','/app.js':'public/app.js','/style.css':'public/style.css','/worker.js':'public/worker.js','/lib/core.js':'lib/core.js'};
    const relative=files[u.pathname];if(!relative){res.writeHead(404);res.end('Not found');return;}
    const content=await readFile(path.join(root,relative));res.writeHead(200,{'Content-Type':mime[path.extname(relative)],'Cache-Control':'no-cache'});res.end(content);
  }catch(e){console.error('Request failed:',e.message);json({error:e.message},503);}
});
server.listen(Number(process.env.PORT)||4317,'127.0.0.1',()=>console.log(`Planner available at http://127.0.0.1:${server.address().port}`));
const timer=setInterval(()=>courses.get().catch(e=>console.error('Course refresh:',e.message)),Math.max(30,Number(process.env.FEED_REFRESH_SECONDS)||60)*1000);timer.unref();
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{clearInterval(timer);server.close(()=>process.exit(0));});
