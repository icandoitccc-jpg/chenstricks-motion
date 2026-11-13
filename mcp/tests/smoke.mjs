import assert from 'node:assert/strict';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createHash} from 'node:crypto';
const url=process.env.MOTION_MCP_URL||'https://motion-guides.chens-tricks.workers.dev/mcp';
const client=new Client({name:'motion-guide-smoke',version:'0.1.0'});
await client.connect(new StreamableHTTPClientTransport(new URL(url)));
try {
 const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name).sort(),['list_guides','read_guide']);assert(tools.tools.every(t=>t.annotations?.readOnlyHint));
 const listing=await client.callTool({name:'list_guides',arguments:{}});const data=JSON.parse(listing.content.find(c=>c.type==='text').text);assert(data.guides.some(g=>g.id==='production-planning'));
 const guide=await client.callTool({name:'read_guide',arguments:{id:'production-planning'}});assert(!guide.isError);const body=guide.content.find(c=>c.type==='text').text;assert(body.includes('## 4. 可直接导入的格式'));
 const source=await(await fetch('https://icandoitccc-jpg.github.io/chenstricks-motion/motion-agent-guide.md')).text();assert(body.endsWith(source));assert(body.includes(createHash('sha256').update(source).digest('hex')));
 const skill=await client.callTool({name:'read_guide',arguments:{id:'agent-entry'}});assert(!skill.isError);const skillSource=await(await fetch('https://icandoitccc-jpg.github.io/chenstricks-motion/motion-agent-skill.md')).text();assert(skill.content.find(c=>c.type==='text').text.endsWith(skillSource));assert(skillSource.includes('read_guide'));
 const resources=await client.listResources();assert.equal(resources.resources.length,1);const resource=await client.readResource({uri:'motion://guides/production-planning'});assert.equal(resource.contents[0].text,source);
 const missing=await client.callTool({name:'read_guide',arguments:{id:'does-not-exist'}});assert(missing.isError);
 const rpc=async(method,params={},id=1)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});const raw=await r.text();const json=r.headers.get('content-type')?.includes('text/event-stream')?JSON.parse(raw.split('\n').find(l=>l.startsWith('data: ')).slice(6)):JSON.parse(raw);assert(r.ok,raw);return json;};
 const init=await rpc('initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'legacy-smoke',version:'1.0.0'},capabilities:{}});assert.equal(init.result.protocolVersion,'2025-11-25');const legacy=await rpc('tools/list');assert.equal(legacy.result.tools.length,2);
 const blocked=await fetch(url,{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});assert.equal(blocked.status,403);
 console.log(JSON.stringify({passed:true,endpoint:url,tests:['official SDK client','read-only tools only','guide directory','full current guide and SHA256','resource read','current Skill entry','unknown ID safe error','2025 client compatibility','invalid browser Origin blocked']},null,2));
}finally{await client.close();}
