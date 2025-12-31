import express from 'express';
import cors from 'cors';
import { CronJob } from 'cron';
import {
  initializeDatabase,
  closeDatabase,
  getAllQueries,
  findQueryById,
  saveQuery,
  updateQuery,
  getPapersForQuery,
  findPaperById,
  findAnalysisByPaperId,
  getStats,
  getDatabase,
} from './database/schema.js';
import { PaperCrawler } from './crawler/paper-crawler.js';
import { GeminiAnalyzer } from './ai/index.js';
import { config } from './config/index.js';
import { SearchQuery, Paper, AIAnalysis } from './types/paper.js';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

// Active crawlers
const activeCrawlers = new Map<string, PaperCrawler>();

// ============ API ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ SEARCH QUERIES ============

// Create new search query
app.post('/api/queries', async (req, res) => {
  try {
    const {
      keywords,
      context,
      field,
      dateFrom,
      dateTo,
      minCitations,
      includeReferences = true,
      maxReferenceDepth = 2,
    } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      res.status(400).json({ error: 'Keywords array is required' });
      return;
    }

    const query: SearchQuery = {
      id: uuidv4(),
      keywords,
      field,
      dateFrom,
      dateTo,
      minCitations,
      includeReferences,
      maxReferenceDepth,
      createdAt: new Date().toISOString(),
      status: 'pending',
      paperCount: 0,
    };

    // Save query
    await saveQuery(query);

    // Start crawler in background
    const crawler = new PaperCrawler(context || '');
    activeCrawlers.set(query.id, crawler);

    // Update status to running
    await updateQuery(query.id, { status: 'running' });

    // Run crawler asynchronously
    crawler.crawl(query)
      .then(() => {
        console.log(`Query ${query.id} completed`);
      })
      .catch((error) => {
        console.error(`Query ${query.id} failed:`, error);
      })
      .finally(() => {
        activeCrawlers.delete(query.id);
      });

    res.status(201).json({
      id: query.id,
      status: 'running',
      message: 'Crawl started in background',
    });
  } catch (error) {
    console.error('Failed to create query:', error);
    res.status(500).json({ error: 'Failed to create query' });
  }
});

// List queries
app.get('/api/queries', async (req, res) => {
  try {
    const queries = await getAllQueries();
    res.json(queries.slice(0, 50));
  } catch (error) {
    console.error('Failed to list queries:', error);
    res.status(500).json({ error: 'Failed to list queries' });
  }
});

// Get query details
app.get('/api/queries/:id', async (req, res) => {
  try {
    const query = await findQueryById(req.params.id);

    if (!query) {
      res.status(404).json({ error: 'Query not found' });
      return;
    }

    res.json(query);
  } catch (error) {
    console.error('Failed to get query:', error);
    res.status(500).json({ error: 'Failed to get query' });
  }
});

// ============ PAPERS ============

// List papers for a query
app.get('/api/queries/:queryId/papers', async (req, res) => {
  try {
    const { decision, sort = 'relevance', limit = 50, offset = 0 } = req.query;

    let papers = await getPapersForQuery(req.params.queryId);

    // Get analyses for papers
    const papersWithAnalyses = await Promise.all(
      papers.map(async (paper) => {
        const analysis = await findAnalysisByPaperId(paper.id);
        return {
          id: paper.id,
          doi: paper.doi,
          title: paper.title,
          authors: paper.authors,
          abstract: paper.abstract,
          keywords: paper.keywords,
          publicationDate: paper.publicationDate,
          journal: paper.journal,
          citationCount: paper.citationCount,
          openAccessUrl: paper.openAccessUrl,
          analysis: analysis ? {
            readingDecision: analysis.readingDecision,
            relevanceScore: analysis.relevanceScore,
            abstractSummary: analysis.abstractSummary,
            readingReason: analysis.readingReason,
          } : null,
        };
      })
    );

    // Filter by decision
    let filtered = papersWithAnalyses;
    if (decision) {
      filtered = filtered.filter((p) => p.analysis?.readingDecision === decision);
    }

    // Sort
    if (sort === 'relevance') {
      filtered.sort((a, b) => (b.analysis?.relevanceScore || 0) - (a.analysis?.relevanceScore || 0));
    } else if (sort === 'citations') {
      filtered.sort((a, b) => b.citationCount - a.citationCount);
    } else if (sort === 'date') {
      filtered.sort((a, b) => {
        const dateA = a.publicationDate ? new Date(a.publicationDate).getTime() : 0;
        const dateB = b.publicationDate ? new Date(b.publicationDate).getTime() : 0;
        return dateB - dateA;
      });
    }

    // Paginate
    const paginated = filtered.slice(Number(offset), Number(offset) + Number(limit));

    res.json(paginated);
  } catch (error) {
    console.error('Failed to list papers:', error);
    res.status(500).json({ error: 'Failed to list papers' });
  }
});

// Get paper details
app.get('/api/papers/:id', async (req, res) => {
  try {
    const paper = await findPaperById(req.params.id);

    if (!paper) {
      res.status(404).json({ error: 'Paper not found' });
      return;
    }

    const analysis = await findAnalysisByPaperId(req.params.id);

    res.json({
      ...paper,
      analysis: analysis || null,
    });
  } catch (error) {
    console.error('Failed to get paper:', error);
    res.status(500).json({ error: 'Failed to get paper' });
  }
});

// ============ STATISTICS ============

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ============ SUMMARY ============

app.get('/api/queries/:queryId/summary', async (req, res) => {
  try {
    const papers = await getPapersForQuery(req.params.queryId);

    const analyses: AIAnalysis[] = [];
    for (const paper of papers) {
      const analysis = await findAnalysisByPaperId(paper.id);
      if (analysis) {
        analyses.push(analysis);
      }
    }

    const analyzer = new GeminiAnalyzer();
    const summary = await analyzer.summarizeCollection(papers, analyses);

    res.json({ summary });
  } catch (error) {
    console.error('Failed to generate summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// ============ SCHEDULED CRAWL ============

const scheduledCrawlJob = new CronJob(
  `0 0 */${config.crawlIntervalHours} * * *`,
  async () => {
    console.log('Running scheduled crawl...');

    const queries = await getAllQueries();
    const completedQueries = queries.filter((q) => q.status === 'completed').slice(0, 5);

    for (const q of completedQueries) {
      const query: SearchQuery = {
        id: uuidv4(),
        keywords: q.keywords,
        field: q.field,
        dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        dateTo: new Date().toISOString().split('T')[0],
        minCitations: q.minCitations,
        includeReferences: q.includeReferences,
        maxReferenceDepth: q.maxReferenceDepth,
        createdAt: new Date().toISOString(),
        status: 'pending',
        paperCount: 0,
      };

      const crawler = new PaperCrawler();
      try {
        await crawler.crawl(query);
        console.log(`Scheduled crawl for "${query.keywords.join(', ')}" completed`);
      } catch (error) {
        console.error(`Scheduled crawl failed:`, error);
      }
    }
  },
  null,
  false,
  'Asia/Seoul'
);

// Start server
async function start() {
  await initializeDatabase();

  const PORT = config.port;
  app.listen(PORT, () => {
    console.log(`Scopus AI Crawler API server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);

    scheduledCrawlJob.start();
    console.log(`Scheduled crawl job started (every ${config.crawlIntervalHours} hours)`);
  });
}

start().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  scheduledCrawlJob.stop();
  await closeDatabase();
  process.exit(0);
});
