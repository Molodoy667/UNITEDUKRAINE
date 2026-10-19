import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateImage,MAX_IMAGE_BYTES,mediaUrl,createMediaHandler} from '../lib/site/media.js';
import {validateDocument,cmsBody} from '../lib/site/content.js';
import {createSiteHandler} from '../lib/site/public.js';
export const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXZkAAAAASUVORK5CYII=';
test('media validates containers, MIME, dimensions, canonical base64 and 2 MiB limit',()=>{
 const value=validateImage({mime:'image/png',data:png});assert.equal(value.width,1);assert.equal(value.height,1);assert.equal(value.size,Buffer.from(png,'base64').length);
 const webp=validateImage({mime:'image/webp',data:'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'});assert.equal(webp.width,1);assert.equal(webp.height,1);
 for(const body of [{mime:'image/jpeg',data:png},{mime:'image/svg+xml',data:png},{mime:'image/png',data:Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')},{mime:'image/png',data:png+'\n'},{mime:'image/png',data:Buffer.alloc(MAX_IMAGE_BYTES+1).toString('base64')}])assert.throws(()=>validateImage(body));
 const huge=Buffer.from(png,'base64');huge.writeUInt32BE(4097,16);assert.throws(()=>validateImage({mime:'image/png',data:huge.toString('base64')}));
 for(let length=0;length<Buffer.from(png,'base64').length;length++)assert.throws(()=>validateImage({mime:'image/png',data:Buffer.from(png,'base64').subarray(0,length).toString('base64')}));
 const id='12345678-1234-4234-8234-123456789abc',doc={kind:'news',slug:'test',title:'Test',excerpt:'',body:'Test',image:mediaUrl(id),category:'',seo_title:'',seo_description:'',published:false};
 assert.equal(validateDocument(doc).image,doc.image);assert.throws(()=>validateDocument({...doc,image:doc.image+'&private=1'}));
 assert.throws(()=>cmsBody({body:{data:'a'.repeat(66000)}}));assert.equal(cmsBody({body:{data:'a'.repeat(66000)}},true).data.length,66000);
});
test('public news CORS preflight needs neither a session nor a database',async()=>{
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},end(){}};
 const dependencies={pool:()=>{throw Error('must not query');}};
 await createSiteHandler({...dependencies,launcherOnly:true})({url:'/api/launcher?action=news',method:'OPTIONS'},res);assert.equal(res.code,204);assert.equal(res.headers['Access-Control-Allow-Origin'],'*');
 await createMediaHandler(dependencies)({url:'/api/media',method:'OPTIONS'},res);assert.equal(res.code,204);
});
