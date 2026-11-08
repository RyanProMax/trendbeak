import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {spawnSync} from 'node:child_process';

const workflow=readFileSync('.github/workflows/daily-sync.yml','utf8').replace(/\r\n/g,'\n');
// This audit intentionally supports only this workflow's flat, explicit steps.
// Reject indirection rather than silently treating aliases as isolated env maps.
const marker='\n    steps:\n',start=workflow.indexOf(marker);
const steps=workflow.slice(start+marker.length).trimEnd().split(/\n(?= {6}- )/);
const secret='${{ secrets.CLOUDFLARE_API_TOKEN }}';
const credentialSteps=new Set(['Require an existing authorized database credential','Update bounded source windows and prepared responses','Update bounded market factors and index valuations','Check new quarterly ETF filings and append only audited releases']);

test('disabled or unconfigured schedules fail visibly before any database writer can run',{skip:process.platform==='win32'?'Requires POSIX shell; exercised by Linux CI':false},()=>{
 assert.match(workflow,/cron: '37 3 \* \* 2-6'/);
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

test('Cloudflare credential is scoped to writer-related steps and never inherited from workflow/job env',()=>{
 assert.ok(start>0);
 assert.doesNotMatch(workflow.slice(0,start),/CLOUDFLARE_API_TOKEN|secrets\./);
 assert.doesNotMatch(workflow,/(?:^|\n)\s*<<:|:\s*[&*][A-Za-z_]/);
 assert.equal(workflow.split(secret).length-1,4);
 assert.equal(steps.length,9);
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
test('low-frequency CN recovery shares the writer queue and all controlled jobs receive one fixed UTC clock',()=>{
 for(const cron of['37 8 * * 1-5','37 3 * * 2-6','17 12 * * *','17 20 * * *'])assert.ok(workflow.includes(`cron: '${cron}'`));
 assert.match(workflow,/group: trendbeak-daily-writer\n  cancel-in-progress: false/);
 assert.match(workflow,/github.event.schedule == '37 3 \* \* 2-6' && 'US' \|\| 'CN'/);
 const clock=steps.find(s=>s.includes('id: clock'));assert.ok(clock);assert.doesNotMatch(clock,/CLOUDFLARE_API_TOKEN|secrets\./);
 assert.equal((workflow.match(/steps.clock.outputs.at/g)||[]).length,3);
 assert.equal((workflow.match(/args\+=\(--catch-up\)/g)||[]).length,2);
 assert.doesNotMatch(workflow,/gh workflow run|actions\/github-script|contents: write|actions: write/);
});

test('quarterly candidate check reuses only US primary runs, and artifacts never inherit the database secret',()=>{
 const job=steps.find(s=>s.includes('id: etf_quarterly'));
 assert.match(job,/env.MARKET == 'US' && env.SYNC_MODE == 'primary'/);
 assert.match(job,/node scripts\/us-etf-quarterly-job.mjs --remote --write --at/);
 const artifact=steps.find(s=>s.includes('uses: actions/upload-artifact'));
 assert.match(artifact,/actions\/upload-artifact@[a-f0-9]{40}/);assert.match(artifact,/retention-days: 7/);
 assert.doesNotMatch(artifact,/CLOUDFLARE_API_TOKEN|secrets\./);
 assert.equal((workflow.match(/- cron:/g)||[]).length,4);
});
