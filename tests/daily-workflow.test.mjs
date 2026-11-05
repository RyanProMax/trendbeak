import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {spawnSync} from 'node:child_process';

const workflow=readFileSync('.github/workflows/daily-sync.yml','utf8');
// This audit intentionally supports only this workflow's flat, explicit steps.
// Reject indirection rather than silently treating aliases as isolated env maps.
const marker='\n    steps:\n',start=workflow.indexOf(marker);
const steps=workflow.slice(start+marker.length).trimEnd().split(/\n(?= {6}- )/);
const secret='${{ secrets.CLOUDFLARE_API_TOKEN }}';
const credentialSteps=new Set(['Require an existing authorized database credential','Update bounded source windows and prepared responses']);

test('disabled or unconfigured schedules fail visibly before any database writer can run',()=>{
 assert.match(workflow,/    if: github.ref == 'refs\/heads\/main'\n/);
 const guard=steps[0].split('        run: |\n')[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n');
 for(const overrides of [{DAILY_SYNC_ENABLED:''},{CLOUDFLARE_ACCOUNT_ID:''},{CLOUDFLARE_API_TOKEN:''}]){
  const result=spawnSync('/bin/sh',['-c',guard],{encoding:'utf8',env:{SYNC_EVENT:'schedule',DAILY_SYNC_ENABLED:'true',CLOUDFLARE_ACCOUNT_ID:'existing-account',CLOUDFLARE_API_TOKEN:'test-only-placeholder',...overrides}});
  assert.equal(result.status,1);
  assert.doesNotMatch(result.stdout,/test-only-placeholder/);
 }
 const result=spawnSync('/bin/sh',['-c',guard],{encoding:'utf8',env:{SYNC_EVENT:'schedule',DAILY_SYNC_ENABLED:'true',CLOUDFLARE_ACCOUNT_ID:'existing-account',CLOUDFLARE_API_TOKEN:'test-only-placeholder'}});
 assert.equal(result.status,0);
});

test('Cloudflare credential is scoped to the two writer-related steps and never inherited from workflow/job env',()=>{
 assert.ok(start>0);
 assert.doesNotMatch(workflow.slice(0,start),/CLOUDFLARE_API_TOKEN|secrets\./);
 assert.doesNotMatch(workflow,/(?:^|\n)\s*<<:|:\s*[&*][A-Za-z_]/);
 assert.equal(workflow.split(secret).length-1,2);
 assert.equal(steps.length,5);
 const allowed=[];
 for(const step of steps){
  const name=/^ {6}- name: (.+)$/m.exec(step)?.[1];
  if(credentialSteps.has(name)){
   assert.match(step,/^ {8}env:\n {10}CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}$/m);
   assert.doesNotMatch(step,/GITHUB_ENV|GITHUB_OUTPUT|::set-env|::set-output/);
   allowed.push(name);
  }else{
   assert.doesNotMatch(step,/CLOUDFLARE_API_TOKEN|secrets\./);
  }
 }
 assert.deepEqual(new Set(allowed),credentialSteps);
});

test('checkout, Node setup and dependency installation have no Cloudflare credential context',()=>{
 const actions=steps.filter(step=>/^ {6}- uses:/m.test(step));
 assert.equal(actions.length,2);
 for(const step of actions){assert.match(step,/uses: actions\/(?:checkout|setup-node)@[a-f0-9]{40}/);assert.doesNotMatch(step,/secrets\.|CLOUDFLARE_API_TOKEN|^ {8}env:/m);}
 const install=steps.find(step=>step.includes('npm install --no-audit --no-fund'));
 assert.ok(install);assert.doesNotMatch(install,/secrets\.|CLOUDFLARE_API_TOKEN|^ {8}env:/m);
 assert.match(workflow,/permissions:\n {2}contents: read/);
 assert.doesNotMatch(workflow,/id-token: write|contents: write/);
});
