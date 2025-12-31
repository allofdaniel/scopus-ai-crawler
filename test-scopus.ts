import { ScopusClient } from './src/api/scopus-client.js';

async function test() {
  console.log('=== Scopus API Test ===\n');

  const scopus = new ScopusClient();

  try {
    const result = await scopus.searchByKeywords(['aviation', 'safety'], { count: 5 });
    console.log('Total results:', result.totalResults);
    console.log('Papers found:', result.papers.length);

    for (const p of result.papers) {
      console.log('\n---');
      console.log('Title:', p.title);
      console.log('DOI:', p.doi || 'N/A');
      console.log('Journal:', p.journal || 'N/A');
      console.log('Citations:', p.citationCount);
      console.log('Date:', p.publicationDate);
    }

    console.log('\n=== SUCCESS ===');
  } catch (error: any) {
    console.error('ERROR:', error.response?.data || error.message);
  }
}

test();
