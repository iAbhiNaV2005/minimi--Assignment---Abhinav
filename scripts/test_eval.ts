import 'dotenv/config';
import { runAgentPipeline } from '../src/agent/engine';

async function main() {
  const refDate = new Date('2026-11-10T12:00:00Z');

  console.log('=====================================================');
  console.log('TEST 1: Monday CRM Shortlist (20-person sales team)');
  console.log('=====================================================');
  const res1 = await runAgentPipeline({
    userQuery:
      'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
    referenceDate: refDate,
    onProgress: (p) => console.log(`[${p.stage}] ${p.message}`),
  });
  console.log('\n--- ANSWER PREVIEW ---');
  console.log(res1.content);
  console.log('\n--- CITATIONS ---');
  console.log(res1.citations.map((c) => `[${c.index}] ${c.title}: ${c.url}`).join('\n'));

  console.log('\n=====================================================');
  console.log('TEST 2: What did I ask you on 3 November?');
  console.log('=====================================================');
  const res2 = await runAgentPipeline({
    userQuery: 'What did I ask you on 3 November? Is your answer still correct today?',
    referenceDate: refDate,
    onProgress: (p) => console.log(`[${p.stage}] ${p.message}`),
  });
  console.log('\n--- ANSWER PREVIEW ---');
  console.log(res2.content);

  console.log('\n=====================================================');
  console.log('TEST 3: Last Tuesday Postgres hosting');
  console.log('=====================================================');
  const res3 = await runAgentPipeline({
    userQuery: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
    referenceDate: refDate,
    onProgress: (p) => console.log(`[${p.stage}] ${p.message}`),
  });
  console.log('\n--- ANSWER PREVIEW ---');
  console.log(res3.content);
}

main().catch(console.error);

