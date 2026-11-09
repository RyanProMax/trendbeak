import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import test from 'node:test';

const workflows=new Map(readdirSync('.github/workflows').filter(name=>/\.ya?ml$/.test(name)).map(name=>[name,readFileSync(`.github/workflows/${name}`,'utf8').replace(/\r\n/g,'\n')]));
const release=workflows.get('us-theme-release.yml');

test('retired GitHub daily writer stays removed and no scheduled replacement is introduced',()=>{
 assert.equal(workflows.has('daily-sync.yml'),false);
 assert.equal(workflows.has('daily-sync.yaml'),false);
 for(const [name,workflow] of workflows){
  // GitHub no longer owns the daily, overview, or quarterly schedule. Check all
  // workflows so moving the retired writer into a new file cannot evade this.
  assert.doesNotMatch(workflow,/\bschedule\s*:|\bcron\s*:/,name);
 }
});

test('manual reviewed-source release retains its gate, writer queue, validation and backup',()=>{
 assert.ok(release,'Keep the separately authorized manual source release');
 const triggers=release.split('\non:\n')[1]?.split('\npermissions:')[0];
 assert.ok(triggers);
 assert.deepEqual([...triggers.matchAll(/^  ([\w-]+):/gm)].map(match=>match[1]),['workflow_dispatch']);
 assert.match(release,/if: github.ref == 'refs\/heads\/main'/);
 assert.match(release,/group: trendbeak-daily-writer\n  cancel-in-progress: false/);
 assert.match(release,/node scripts\/us-theme-release-input\.mjs/);
 assert.match(release,/node scripts\/us-theme-valuation-import\.mjs[^\n]*--write --backup/);
 assert.match(release,/retention-days: 7/);
});

test('remaining workflows keep read-only permissions and isolate the manual database credential',()=>{
 const marker='\n    steps:\n';
 for(const [name,workflow] of workflows){
  assert.match(workflow,/permissions:\n  contents: read\n/,name);
  assert.doesNotMatch(workflow,/\b[\w-]+: write\b|(?:^|\n)\s*<<:|:\s*[&*][A-Za-z_]/,name);
  for(const action of workflow.matchAll(/\buses: (\S+)/g))assert.match(action[1],/^[\w./-]+@[a-f0-9]{40}$/,name);
  if(name!=='us-theme-release.yml')assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN/,name);
 }
 const start=release.indexOf(marker);
 assert.ok(start>0);
 assert.doesNotMatch(release.slice(0,start),/secrets\.|CLOUDFLARE_API_TOKEN/);
 const steps=release.slice(start+marker.length).trimEnd().split(/\n(?= {6}- )/);
 const writer=steps.filter(step=>step.includes('node scripts/us-theme-valuation-import.mjs'));
 assert.equal(writer.length,1);
 assert.match(writer[0],/^ {8}env:\n {10}CLOUDFLARE_ACCOUNT_ID:.*\n {10}CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}$/m);
 assert.match(writer[0],/test -n "\$CLOUDFLARE_API_TOKEN"/);
 assert.doesNotMatch(writer[0],/GITHUB_ENV|GITHUB_OUTPUT|::set-env|::set-output/);
 for(const step of steps.filter(step=>step!==writer[0]))assert.doesNotMatch(step,/secrets\.|CLOUDFLARE_API_TOKEN/);
 assert.ok(release.indexOf('node scripts/us-theme-release-input.mjs')<release.indexOf('node scripts/us-theme-valuation-import.mjs'));
});

test('quality and security checks remain available on pushes and pull requests',()=>{
 for(const name of ['quality.yml','security.yml']){
  const workflow=workflows.get(name);
  assert.ok(workflow,`Keep ${name}`);
  for(const event of ['push','pull_request','workflow_dispatch'])assert.match(workflow,new RegExp(`^  ${event}:`,'m'));
  assert.match(workflow,/npm run security:check/);
 }
 assert.match(workflows.get('quality.yml'),/run: npm test/);
 assert.match(workflows.get('quality.yml'),/run: npm run test:budget/);
 assert.match(workflows.get('security.yml'),/gitleaks\/gitleaks-action@[a-f0-9]{40}/);
 assert.match(workflows.get('security.yml'),/fetch-depth: 0/);
});
