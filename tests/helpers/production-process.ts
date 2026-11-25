import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { startTestProcess } from './process-harness.js';
export async function freePort() {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('TEST_PORT_UNAVAILABLE');
  const port = address.port;
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  return port;
}
export async function startProductionTestProcess(
  directory: string,
  databasePath: string,
  ports: { teacher: number; student: number },
) {
  const entryPath = join(directory, 'production-child.mjs');
  const entry = `
 import {registerHooks,stripTypeScriptTypes} from 'node:module';
 import {existsSync,readFileSync} from 'node:fs';
 import {fileURLToPath,pathToFileURL} from 'node:url';
 const workspace=${JSON.stringify(resolve('.'))};
 registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('@classroom/shared/'))return next(pathToFileURL(workspace+'/shared/src/'+specifier.slice('@classroom/shared/'.length)+'.ts').href,context);
  if(specifier.startsWith('.')&&specifier.endsWith('.js')){const target=new URL(specifier.slice(0,-3)+'.ts',context.parentURL);if(existsSync(fileURLToPath(target)))return next(target.href,context);}
  return next(specifier,context);
 },load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(readFileSync(fileURLToPath(url),'utf8'),{mode:'transform',sourceUrl:url}),shortCircuit:true};return next(url,context);}});
 await import(pathToFileURL(workspace+'/backend/src/main.ts').href);
 let ready=false;for(let attempt=0;attempt<100;attempt++){try{const response=await fetch('http://127.0.0.1:'+process.env.STUDENT_PORT+'/api/health');if(response.ok){const data=await response.json();process.send({kind:'ready',bootId:data.data.bootId});ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,50));}
 if(!ready)process.exitCode=1;
 `;
  writeFileSync(entryPath, entry);
  const child = await startTestProcess({
    entryPath,
    env: {
      DATABASE_PATH: databasePath,
      TEACHER_PORT: String(ports.teacher),
      STUDENT_PORT: String(ports.student),
      STUDENT_PUBLIC_ORIGIN: 'http://127.0.0.1:' + ports.student,
    },
  });
  try {
    const ready = await child.waitForMessage((message) => message.kind === 'ready', 12000);
    return {
      ...child,
      bootId: String(ready.bootId),
      teacherUrl: 'http://127.0.0.1:' + ports.teacher,
      studentUrl: 'http://127.0.0.1:' + ports.student,
    };
  } catch (error) {
    await child.stop();
    throw error;
  }
}
