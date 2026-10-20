import {fail} from '../account/core.js';
import {manifestUrls,sha256} from './policy.js';
const maxBytes=16*1024*1024;
async function manifest(request,url,publicationId){
 const target=new URL(url);target.searchParams.set('release',publicationId);
 const response=await request(target,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json','Cache-Control':'no-cache'}});
 if(!response.ok||!/^application\/(?:json|octet-stream)(?:;|$)/i.test(response.headers.get('content-type')||''))fail(502,'manifest_unavailable','CDN manifest unavailable or has a non-JSON content type.');
 const length=Number(response.headers.get('content-length'));if(length>maxBytes)fail(502,'manifest_too_large','CDN manifest exceeds 16 MiB.');
 const reader=response.body?.getReader();if(!reader)fail(502,'manifest_unavailable','Empty CDN response.');
 let bytes=0;const chunks=[];
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>maxBytes){await reader.cancel();fail(502,'manifest_too_large','CDN manifest exceeds 16 MiB.');}chunks.push(Buffer.from(part.value));}}
 finally{reader.releaseLock();}
 const data=Buffer.concat(chunks);let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{fail(502,'invalid_manifest','CDN manifest must be valid UTF-8 JSON.');}
 return {hash:sha256(data),parsed};
}
export async function verifyManifests(body,request=fetch){
 const [files,archives]=await Promise.all([manifest(request,manifestUrls.files,body.publicationId),manifest(request,manifestUrls.archives,body.publicationId)]);
 if(files.hash!==body.filesSha256||archives.hash!==body.archivesSha256)fail(409,'manifest_hash_mismatch','Published CDN bytes do not match the requested hashes. No activation performed.');
 if(!files.parsed||typeof files.parsed!=='object'||!Array.isArray(files.parsed.list)||!archives.parsed||typeof archives.parsed!=='object'||Array.isArray(archives.parsed))fail(502,'invalid_manifest','Unexpected manifest root structure.');
 // This verifies the two marker files, not all ZIP/asset bytes. Manager attests upload completion.
 return {manifests:'cdn-sha256',assets:'publisher-attested'};
}
