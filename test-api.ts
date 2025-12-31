import { SemanticScholarClient } from './src/api/semantic-scholar-client.js';
import { OpenAlexClient } from './src/api/openalex-client.js';
import { CrossRefClient } from './src/api/crossref-client.js';

async function test() {
  console.log('=== API Test ===\n');

  // Test Semantic Scholar
  console.log('1. Testing Semantic Scholar API...');
  const s2 = new SemanticScholarClient();
  try {
    const result = await s2.search('machine learning aviation safety', { limit: 3 });
    console.log('   Total results:', result.totalResults);
    console.log('   Papers found:', result.papers.length);
    for (const p of result.papers) {
      console.log('   -', p.title.slice(0, 60) + '...');
    }
    console.log('   SUCCESS!\n');
  } catch (error: any) {
    console.error('   ERROR:', error.message, '\n');
  }

  // Test OpenAlex
  console.log('2. Testing OpenAlex API...');
  const oa = new OpenAlexClient();
  try {
    const result = await oa.search('machine learning', { perPage: 3 });
    console.log('   Total results:', result.totalResults);
    console.log('   Papers found:', result.papers.length);
    for (const p of result.papers) {
      console.log('   -', p.title.slice(0, 60) + '...');
    }
    console.log('   SUCCESS!\n');
  } catch (error: any) {
    console.error('   ERROR:', error.message, '\n');
  }

  // Test CrossRef
  console.log('3. Testing CrossRef API...');
  const cr = new CrossRefClient();
  try {
    const result = await cr.search('deep learning', { rows: 3 });
    console.log('   Total results:', result.totalResults);
    console.log('   Papers found:', result.papers.length);
    for (const p of result.papers) {
      console.log('   -', p.title.slice(0, 60) + '...');
    }
    console.log('   SUCCESS!\n');
  } catch (error: any) {
    console.error('   ERROR:', error.message, '\n');
  }

  console.log('=== Test Complete ===');
}

test();
