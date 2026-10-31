import {readFile,writeFile,mkdir,stat,copyFile} from 'node:fs/promises';
import {resolve,relative,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';

// Offline only. No fetch, token, package installation or source repository scripts.
// Usage: node scripts/export-us-history.mjs REQUEST.json [--verify]
const requestFile=process.argv[2],verify=process.argv.includes('--verify');
if(!requestFile)throw Error('Provide a local export request JSON');
const requestRoot=dirname(resolve(requestFile)),request=JSON.parse(await readFile(resolve(requestFile),'utf8')),root=process.cwd(),out=resolve(requestRoot,request.outputDirectory);
const rawPath=resolve(requestRoot,request.rawFile),calendarPath=resolve(requestRoot,request.calendarFile);
const rel=relative(root,out);if(!rel.startsWith('..')&&!rel.startsWith('/'))throw Error('Unconfirmed history must stay outside the repository/build inputs');
const bytes=await readFile(rawPath),calendarBytes=await readFile(calendarPath),calendar=JSON.parse(calendarBytes),raw=JSON.parse(bytes);
const parserBytes=await readFile(join(root,'src/server/cnn-history.ts')),hash=b=>createHash('sha256').update(b).digest('hex');
const vite=await createServer({root,configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false}});
try{
 const tools=await vite.ssrLoadModule('/src/server/us-history-artifact.ts');
 if(!Array.isArray(calendar.dates))throw Error('Expected local benchmark calendar dates');
 const artifactPath=join(out,'us-history.candidate.json');
 let meta;
 if(verify){const saved=JSON.parse(await readFile(artifactPath));meta=saved.meta;
  if(meta.rawSha256!==hash(bytes)||meta.calendarSha256!==hash(calendarBytes)||meta.parserSha256!==hash(parserBytes))throw Error('Raw/calendar/parser checksum changed');
  const rebuilt=await tools.buildUSHistoryArtifact(raw,calendar.dates,meta);
  const {checksum,...savedBody}=saved;
  if(rebuilt.checksum.value!==checksum?.value||await tools.historyDigest(savedBody)!==checksum.value)throw Error('Artifact does not reproduce from the pinned inputs');
  console.log(JSON.stringify({verified:true,artifact:artifactPath,checksum:rebuilt.checksum,coverage:rebuilt.coverage,activated:false}));
 }else{
  meta={source:request.source,receivedAt:new Date((await stat(rawPath)).mtimeMs).toISOString(),parsedAt:request.parsedAt,generatedAt:new Date().toISOString(),rawSha256:hash(bytes),calendarSha256:hash(calendarBytes),parserSha256:hash(parserBytes),window:request.window};
  const artifact=await tools.buildUSHistoryArtifact(raw,calendar.dates,meta);
  await mkdir(out,{recursive:true});await copyFile(rawPath,join(out,'raw-cnn.json'));await copyFile(calendarPath,join(out,'benchmark-dates.json'));
  await writeFile(artifactPath,JSON.stringify(artifact,null,2)+'\n');
  await writeFile(join(out,'parser-source.ts'),parserBytes);
  await writeFile(join(out,'reproduce-request.json'),JSON.stringify({...request,rawFile:'raw-cnn.json',calendarFile:'benchmark-dates.json',outputDirectory:'.'},null,2)+'\n');
  await writeFile(join(out,'sha256sums.json'),JSON.stringify({rawFileSha256:hash(bytes),calendarFileSha256:hash(calendarBytes),parserFileSha256:hash(parserBytes),artifactFileSha256:hash(Buffer.from(JSON.stringify(artifact,null,2)+'\n')),canonicalPayloadSha256:artifact.checksum.value},null,2)+'\n');
  await writeFile(join(out,'manifest.json'),JSON.stringify({artifact:artifactPath,meta,checksum:artifact.checksum,coverage:artifact.coverage,rights:artifact.rights},null,2)+'\n');
  await writeFile(join(out,'README.txt'),'LOCAL CANDIDATE ONLY — redistribution and production activation pending.\nRaw input, benchmark-date input and parser hashes are recorded in manifest.json.\nReproduce using scripts/export-us-history.mjs /path/to/bundle/reproduce-request.json --verify.\nNA means missing real observation, never zero or interpolated.\nNo DB or scheduled collector was created. Cache alone is not permanent storage.\n');
  console.log(JSON.stringify({exported:true,artifact:artifactPath,checksum:artifact.checksum,coverage:artifact.coverage,activated:false}));
 }
}finally{await vite.close();}
