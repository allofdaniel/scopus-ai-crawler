import { v4 as uuidv4 } from 'uuid';
import { ScopusClient, SemanticScholarClient, OpenAlexClient, CrossRefClient } from '../api/index.js';
import { GeminiAnalyzer } from '../ai/index.js';
import {
  savePaper,
  saveAnalysis,
  saveSession,
  updateQuery,
  linkPaperToQuery,
  getPapersForQuery as dbGetPapersForQuery,
  findPaperByDOI,
  findPaperByTitle,
} from '../database/schema.js';
import { Paper, AIAnalysis, SearchQuery, CrawlSession } from '../types/paper.js';
import { config } from '../config/index.js';

export class PaperCrawler {
  private scopus: ScopusClient;
  private semanticScholar: SemanticScholarClient;
  private openAlex: OpenAlexClient;
  private crossRef: CrossRefClient;
  private analyzer: GeminiAnalyzer;

  constructor(researchContext: string = '') {
    this.scopus = new ScopusClient();
    this.semanticScholar = new SemanticScholarClient();
    this.openAlex = new OpenAlexClient();
    this.crossRef = new CrossRefClient();
    this.analyzer = new GeminiAnalyzer(researchContext);
  }

  setResearchContext(context: string): void {
    this.analyzer.setResearchContext(context);
  }

  async crawl(query: SearchQuery): Promise<CrawlSession> {
    const session: CrawlSession = {
      id: uuidv4(),
      queryId: query.id,
      startedAt: new Date().toISOString(),
      status: 'running',
      papersFound: 0,
      papersAnalyzed: 0,
      errors: [],
    };

    await saveSession(session);

    try {
      // Phase 1: Search all APIs for initial papers
      console.log(`Starting crawl for query: ${query.keywords.join(', ')}`);
      const initialPapers = await this.searchAllAPIs(query);
      console.log(`Found ${initialPapers.length} initial papers`);

      // Phase 2: Deduplicate papers
      const uniquePapers = this.deduplicatePapers(initialPapers);
      console.log(`${uniquePapers.length} unique papers after deduplication`);

      // Phase 3: Save papers and track relations
      for (const paper of uniquePapers) {
        await this.savePaperWithRelation(paper, query.id, 0);
      }
      session.papersFound = uniquePapers.length;
      await saveSession(session);

      // Phase 4: Follow references if enabled
      if (query.includeReferences && query.maxReferenceDepth > 0) {
        await this.followReferences(uniquePapers, query, session);
      }

      // Phase 5: AI Analysis
      console.log('Starting AI analysis...');
      const allPapers = await dbGetPapersForQuery(query.id);
      await this.analyzePapers(allPapers, session);

      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      await saveSession(session);

      // Update query status
      await updateQuery(query.id, { status: 'completed', paperCount: session.papersFound });

      return session;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      session.errors.push(errorMessage);
      session.status = 'failed';
      session.completedAt = new Date().toISOString();
      await saveSession(session);
      await updateQuery(query.id, { status: 'failed', paperCount: session.papersFound });
      throw error;
    }
  }

  private async searchAllAPIs(query: SearchQuery): Promise<Paper[]> {
    const allPapers: Paper[] = [];
    const keywordQuery = query.keywords.join(' ');
    const maxPerSource = Math.ceil(config.maxPapersPerSearch / 4);

    // Search all APIs in parallel
    const [scopusResult, semanticResult, openAlexResult, crossRefResult] = await Promise.allSettled([
      this.scopus.searchByKeywords(query.keywords, {
        count: maxPerSource,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        field: query.field,
      }),
      this.semanticScholar.search(keywordQuery, {
        limit: maxPerSource,
        year: query.dateFrom?.slice(0, 4),
        minCitationCount: query.minCitations,
      }),
      this.openAlex.searchByKeywords(query.keywords, {
        fromDate: query.dateFrom,
        toDate: query.dateTo,
        minCitations: query.minCitations,
        perPage: maxPerSource,
      }),
      this.crossRef.searchByKeywords(query.keywords, {
        fromDate: query.dateFrom,
        toDate: query.dateTo,
        rows: maxPerSource,
      }),
    ]);

    // Collect successful results
    if (scopusResult.status === 'fulfilled') {
      console.log(`Scopus found ${scopusResult.value.papers.length} papers`);
      allPapers.push(...scopusResult.value.papers);
    } else {
      console.error('Scopus search failed:', scopusResult.reason);
    }

    if (semanticResult.status === 'fulfilled') {
      console.log(`Semantic Scholar found ${semanticResult.value.papers.length} papers`);
      allPapers.push(...semanticResult.value.papers);
    } else {
      console.error('Semantic Scholar search failed:', semanticResult.reason);
    }

    if (openAlexResult.status === 'fulfilled') {
      console.log(`OpenAlex found ${openAlexResult.value.papers.length} papers`);
      allPapers.push(...openAlexResult.value.papers);
    } else {
      console.error('OpenAlex search failed:', openAlexResult.reason);
    }

    if (crossRefResult.status === 'fulfilled') {
      console.log(`CrossRef found ${crossRefResult.value.papers.length} papers`);
      allPapers.push(...crossRefResult.value.papers);
    } else {
      console.error('CrossRef search failed:', crossRefResult.reason);
    }

    return allPapers;
  }

  private deduplicatePapers(papers: Paper[]): Paper[] {
    const seen = new Map<string, Paper>();

    for (const paper of papers) {
      let key: string;

      if (paper.doi) {
        key = `doi:${paper.doi.toLowerCase()}`;
      } else {
        key = `title:${this.normalizeTitle(paper.title)}`;
      }

      if (!seen.has(key)) {
        seen.set(key, paper);
      } else {
        const existing = seen.get(key)!;
        this.mergePaperData(existing, paper);
      }
    }

    return Array.from(seen.values());
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private mergePaperData(existing: Paper, newPaper: Paper): void {
    if (!existing.abstract && newPaper.abstract) {
      existing.abstract = newPaper.abstract;
    }
    if (!existing.doi && newPaper.doi) {
      existing.doi = newPaper.doi;
    }
    if (!existing.scopusId && newPaper.scopusId) {
      existing.scopusId = newPaper.scopusId;
    }
    if (!existing.semanticScholarId && newPaper.semanticScholarId) {
      existing.semanticScholarId = newPaper.semanticScholarId;
    }
    if (!existing.openAlexId && newPaper.openAlexId) {
      existing.openAlexId = newPaper.openAlexId;
    }

    if (newPaper.citationCount > existing.citationCount) {
      existing.citationCount = newPaper.citationCount;
    }

    const existingRefs = new Set(existing.references);
    for (const ref of newPaper.references) {
      existingRefs.add(ref);
    }
    existing.references = Array.from(existingRefs);

    const existingKeywords = new Set(existing.keywords);
    for (const keyword of newPaper.keywords) {
      existingKeywords.add(keyword);
    }
    existing.keywords = Array.from(existingKeywords);

    if (!existing.pdfUrl && newPaper.pdfUrl) {
      existing.pdfUrl = newPaper.pdfUrl;
    }
    if (!existing.openAccessUrl && newPaper.openAccessUrl) {
      existing.openAccessUrl = newPaper.openAccessUrl;
    }
  }

  private async followReferences(
    papers: Paper[],
    query: SearchQuery,
    session: CrawlSession,
    currentDepth: number = 1
  ): Promise<void> {
    if (currentDepth > query.maxReferenceDepth) return;

    console.log(`Following references at depth ${currentDepth}`);

    const allRefs = new Set<string>();
    for (const paper of papers) {
      for (const ref of paper.references.slice(0, 10)) {
        allRefs.add(ref);
      }
    }

    console.log(`Found ${allRefs.size} unique references to follow`);

    const refsToFetch = Array.from(allRefs).slice(0, 50);
    const fetchedPapers: Paper[] = [];

    for (const ref of refsToFetch) {
      if (ref.includes('/') || ref.includes('10.')) {
        const paper = await this.semanticScholar.searchByDOI(ref);
        if (paper) {
          fetchedPapers.push(paper);
          continue;
        }
      }

      if (ref.length === 40) {
        const paper = await this.semanticScholar.getPaperDetails(ref);
        if (paper) {
          fetchedPapers.push(paper);
        }
      }
    }

    if (fetchedPapers.length > 0) {
      const uniqueRefs = this.deduplicatePapers(fetchedPapers);
      const newRefs = await this.filterExistingPapers(uniqueRefs);

      console.log(`Found ${newRefs.length} new referenced papers`);

      for (const paper of newRefs) {
        await this.savePaperWithRelation(paper, query.id, currentDepth);
      }

      session.papersFound += newRefs.length;
      await saveSession(session);

      if (currentDepth < query.maxReferenceDepth && newRefs.length > 0) {
        await this.followReferences(newRefs, query, session, currentDepth + 1);
      }
    }
  }

  private async analyzePapers(papers: Paper[], session: CrawlSession): Promise<void> {
    const toAnalyze: Paper[] = [];

    for (const paper of papers) {
      const screen = await this.analyzer.quickScreen(paper);
      if (screen.shouldAnalyze) {
        toAnalyze.push(paper);
      }
    }

    console.log(`${toAnalyze.length} papers passed quick screening for full analysis`);

    const analyses = await this.analyzer.batchAnalyzePapers(toAnalyze);

    for (const analysis of analyses) {
      await saveAnalysis(analysis);
      session.papersAnalyzed++;
    }

    await saveSession(session);
  }

  private async savePaperWithRelation(paper: Paper, queryId: string, depth: number): Promise<void> {
    const existingByDOI = paper.doi ? await findPaperByDOI(paper.doi) : null;
    const existingByTitle = await findPaperByTitle(paper.title);
    const existing = existingByDOI || existingByTitle;

    if (existing) {
      // Merge and update
      this.mergePaperData(existing, paper);
      existing.lastUpdated = new Date().toISOString();
      await savePaper(existing);
      await linkPaperToQuery(existing.id, queryId, depth);
    } else {
      await savePaper(paper);
      await linkPaperToQuery(paper.id, queryId, depth);
    }
  }

  private async filterExistingPapers(papers: Paper[]): Promise<Paper[]> {
    const newPapers: Paper[] = [];

    for (const paper of papers) {
      if (paper.doi) {
        const existing = await findPaperByDOI(paper.doi);
        if (existing) continue;
      }

      const existingByTitle = await findPaperByTitle(paper.title);
      if (!existingByTitle) {
        newPapers.push(paper);
      }
    }

    return newPapers;
  }
}
