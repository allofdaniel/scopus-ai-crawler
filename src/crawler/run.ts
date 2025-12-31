import { v4 as uuidv4 } from 'uuid';
import { initializeDatabase, closeDatabase, saveQuery, getAllQueries, getPapersForQuery, findAnalysisByPaperId } from '../database/schema.js';
import { PaperCrawler } from './paper-crawler.js';
import { SearchQuery } from '../types/paper.js';

async function main() {
  console.log('=== Scopus AI Crawler ===\n');

  // Initialize database
  console.log('Initializing database...');
  await initializeDatabase();

  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run crawl -- "keyword1" "keyword2" [options]');
    console.log('');
    console.log('Options:');
    console.log('  --context "research context"  Description of your research area');
    console.log('  --field CODE                  Scopus subject area code (e.g., ENGI, COMP)');
    console.log('  --from YYYY-MM-DD            Start date for papers');
    console.log('  --to YYYY-MM-DD              End date for papers');
    console.log('  --min-citations N            Minimum citation count');
    console.log('  --follow-refs                Follow references (depth: 2)');
    console.log('  --depth N                    Reference follow depth (default: 2)');
    console.log('');
    console.log('Example:');
    console.log('  npm run crawl -- "machine learning" "aviation safety" --context "Research on ML applications in aviation safety systems" --follow-refs');
    process.exit(0);
  }

  // Parse arguments
  const keywords: string[] = [];
  let context = '';
  let field: string | undefined;
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  let minCitations: number | undefined;
  let followRefs = false;
  let depth = 2;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--context' && args[i + 1]) {
      context = args[++i];
    } else if (arg === '--field' && args[i + 1]) {
      field = args[++i];
    } else if (arg === '--from' && args[i + 1]) {
      dateFrom = args[++i];
    } else if (arg === '--to' && args[i + 1]) {
      dateTo = args[++i];
    } else if (arg === '--min-citations' && args[i + 1]) {
      minCitations = parseInt(args[++i], 10);
    } else if (arg === '--follow-refs') {
      followRefs = true;
    } else if (arg === '--depth' && args[i + 1]) {
      depth = parseInt(args[++i], 10);
    } else if (!arg.startsWith('--')) {
      keywords.push(arg);
    }
  }

  if (keywords.length === 0) {
    console.error('Error: At least one keyword is required');
    process.exit(1);
  }

  console.log('Search Configuration:');
  console.log(`  Keywords: ${keywords.join(', ')}`);
  console.log(`  Research Context: ${context || '(none)'}`);
  console.log(`  Field: ${field || 'all'}`);
  console.log(`  Date Range: ${dateFrom || 'any'} to ${dateTo || 'any'}`);
  console.log(`  Min Citations: ${minCitations || 'any'}`);
  console.log(`  Follow References: ${followRefs} (depth: ${depth})`);
  console.log('');

  // Create search query
  const query: SearchQuery = {
    id: uuidv4(),
    keywords,
    field,
    dateFrom,
    dateTo,
    minCitations,
    includeReferences: followRefs,
    maxReferenceDepth: depth,
    createdAt: new Date().toISOString(),
    status: 'pending',
    paperCount: 0,
  };

  // Save query to database
  await saveQuery({ ...query, status: 'running' });

  // Run crawler
  const crawler = new PaperCrawler(context);

  try {
    console.log('Starting crawl...\n');
    const session = await crawler.crawl(query);

    console.log('\n=== Crawl Complete ===');
    console.log(`Session ID: ${session.id}`);
    console.log(`Papers Found: ${session.papersFound}`);
    console.log(`Papers Analyzed: ${session.papersAnalyzed}`);
    console.log(`Status: ${session.status}`);

    if (session.errors.length > 0) {
      console.log(`Errors: ${session.errors.length}`);
      session.errors.forEach((e) => console.log(`  - ${e}`));
    }

    // Print summary of top papers
    const papers = await getPapersForQuery(query.id);
    const topPapers: { paper: typeof papers[0]; analysis: Awaited<ReturnType<typeof findAnalysisByPaperId>> }[] = [];

    for (const paper of papers) {
      const analysis = await findAnalysisByPaperId(paper.id);
      if (analysis && (analysis.readingDecision === 'must_read' || analysis.readingDecision === 'should_read')) {
        topPapers.push({ paper, analysis });
      }
    }

    topPapers.sort((a, b) => (b.analysis?.relevanceScore || 0) - (a.analysis?.relevanceScore || 0));

    if (topPapers.length > 0) {
      console.log('\n=== Top Recommended Papers ===');
      for (const { paper, analysis } of topPapers.slice(0, 10)) {
        if (analysis) {
          console.log(`\n[${analysis.readingDecision.toUpperCase()}] ${paper.title}`);
          console.log(`  Citations: ${paper.citationCount} | Relevance: ${(analysis.relevanceScore * 100).toFixed(0)}%`);
          console.log(`  ${analysis.readingReason}`);
        }
      }
    }

  } catch (error) {
    console.error('Crawl failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main().catch(console.error);
