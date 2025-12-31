import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Types
interface Paper {
  id: string;
  doi?: string;
  title: string;
  authors: { name: string }[];
  abstract?: string;
  keywords: string[];
  publicationDate?: string;
  journal?: string;
  citationCount: number;
  source: string;
  openAccessUrl?: string;
  pdfPath?: string;
  references?: string[]; // DOIs or paper IDs
}

interface Analysis {
  readingDecision: 'must_read' | 'should_read' | 'maybe_read' | 'skip';
  readingReason: string;
  relevanceScore: number;
  abstractSummary: string;
  keyFindings: string[];
  methodologySummary?: string;
  limitations?: string[];
}

interface AnalyzedPaper extends Paper {
  analysis?: Analysis;
  analyzedAt?: string;
  depth: number; // 0 = initial search, 1+ = from references
}

interface CrawlerDatabase {
  papers: Record<string, AnalyzedPaper>;
  queries: { keywords: string[]; context: string; createdAt: string }[];
  lastUpdated: string;
}

interface CrawlerConfig {
  keywords: string[];
  context: string;
  maxDepth: number;
  papersPerSource: number;
  downloadPdfs: boolean;
  outputDir: string;
}

// API Clients
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1';
const OPENALEX_API = 'https://api.openalex.org';
const CROSSREF_API = 'https://api.crossref.org';

class AcademicCrawler {
  private db: CrawlerDatabase;
  private dbPath: string;
  private config: CrawlerConfig;
  private genAI: GoogleGenerativeAI | null = null;
  private pdfDir: string;

  constructor(config: CrawlerConfig) {
    this.config = config;
    this.dbPath = path.join(config.outputDir, 'crawler-db.json');
    this.pdfDir = path.join(config.outputDir, 'pdfs');

    // Initialize Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }

    // Load or create database
    this.db = this.loadDatabase();

    // Ensure directories exist
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }
    if (config.downloadPdfs && !fs.existsSync(this.pdfDir)) {
      fs.mkdirSync(this.pdfDir, { recursive: true });
    }
  }

  private loadDatabase(): CrawlerDatabase {
    if (fs.existsSync(this.dbPath)) {
      const data = fs.readFileSync(this.dbPath, 'utf-8');
      return JSON.parse(data);
    }
    return {
      papers: {},
      queries: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  private saveDatabase(): void {
    this.db.lastUpdated = new Date().toISOString();
    fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2));
  }

  private getPaperKey(paper: Paper): string {
    if (paper.doi) return `doi:${paper.doi.toLowerCase()}`;
    return `title:${paper.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  }

  private isPaperProcessed(paper: Paper): boolean {
    const key = this.getPaperKey(paper);
    return !!this.db.papers[key];
  }

  // Search APIs
  async searchSemanticScholar(query: string, limit: number): Promise<Paper[]> {
    console.log(`  [S2] Searching: "${query}"`);
    const fields = 'paperId,externalIds,title,abstract,venue,year,citationCount,authors,openAccessPdf,publicationDate,references';

    try {
      const response = await axios.get(
        `${SEMANTIC_SCHOLAR_API}/paper/search`,
        {
          params: { query, limit, fields },
          headers: { Accept: 'application/json' },
          timeout: 30000,
        }
      );

      return (response.data.data || []).map((p: any) => ({
        id: p.paperId,
        doi: p.externalIds?.DOI,
        title: p.title || 'Untitled',
        authors: (p.authors || []).map((a: any) => ({ name: a.name || 'Unknown' })),
        abstract: p.abstract,
        keywords: [],
        publicationDate: p.publicationDate,
        journal: p.venue,
        citationCount: p.citationCount || 0,
        source: 'semantic_scholar',
        openAccessUrl: p.openAccessPdf?.url,
        references: (p.references || []).map((r: any) => r.paperId).filter(Boolean),
      }));
    } catch (error: any) {
      console.error(`  [S2] Error: ${error.message}`);
      return [];
    }
  }

  async searchOpenAlex(query: string, limit: number): Promise<Paper[]> {
    console.log(`  [OA] Searching: "${query}"`);

    try {
      const response = await axios.get(`${OPENALEX_API}/works`, {
        params: {
          search: query,
          per_page: limit,
          sort: 'cited_by_count:desc',
        },
        headers: { 'User-Agent': 'ScopusAICrawler/1.0 (research tool)' },
        timeout: 30000,
      });

      return (response.data.results || []).map((w: any) => {
        let abstract: string | undefined;
        if (w.abstract_inverted_index) {
          const words: [string, number][] = [];
          for (const [word, positions] of Object.entries(w.abstract_inverted_index)) {
            for (const pos of positions as number[]) {
              words.push([word, pos]);
            }
          }
          words.sort((a, b) => a[1] - b[1]);
          abstract = words.map((w) => w[0]).join(' ');
        }

        return {
          id: w.id?.replace('https://openalex.org/', '') || '',
          doi: w.doi?.replace('https://doi.org/', ''),
          title: w.display_name || 'Untitled',
          authors: (w.authorships || []).slice(0, 10).map((a: any) => ({
            name: a.author?.display_name || 'Unknown',
          })),
          abstract,
          keywords: (w.concepts || []).slice(0, 5).map((c: any) => c.display_name),
          publicationDate: w.publication_date,
          journal: w.primary_location?.source?.display_name,
          citationCount: w.cited_by_count || 0,
          source: 'openalex',
          openAccessUrl: w.open_access?.oa_url,
          references: (w.referenced_works || []).map((r: string) => r.replace('https://openalex.org/', '')),
        };
      });
    } catch (error: any) {
      console.error(`  [OA] Error: ${error.message}`);
      return [];
    }
  }

  async searchCrossRef(query: string, limit: number): Promise<Paper[]> {
    console.log(`  [CR] Searching: "${query}"`);

    try {
      const response = await axios.get(`${CROSSREF_API}/works`, {
        params: {
          query,
          rows: limit,
          sort: 'is-referenced-by-count',
          order: 'desc',
        },
        headers: { 'User-Agent': 'ScopusAICrawler/1.0 (research tool)' },
        timeout: 30000,
      });

      return (response.data.message?.items || []).map((w: any) => {
        let publicationDate: string | undefined;
        if (w.issued?.['date-parts']?.[0]) {
          const [year, month = 1, day = 1] = w.issued['date-parts'][0];
          publicationDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }

        return {
          id: w.DOI || Math.random().toString(36).slice(2),
          doi: w.DOI,
          title: w.title?.[0] || 'Untitled',
          authors: (w.author || []).slice(0, 10).map((a: any) => ({
            name: a.name || `${a.given || ''} ${a.family || ''}`.trim() || 'Unknown',
          })),
          abstract: w.abstract?.replace(/<[^>]*>/g, ''), // Strip HTML
          keywords: w.subject || [],
          publicationDate,
          journal: w['container-title']?.[0],
          citationCount: w['is-referenced-by-count'] || 0,
          source: 'crossref',
          openAccessUrl: w.link?.find((l: any) => l['content-type'] === 'application/pdf')?.URL,
          references: (w.reference || []).map((r: any) => r.DOI).filter(Boolean),
        };
      });
    } catch (error: any) {
      console.error(`  [CR] Error: ${error.message}`);
      return [];
    }
  }

  // Get paper by ID/DOI for reference following
  async getPaperByDoi(doi: string): Promise<Paper | null> {
    try {
      // Try Semantic Scholar first
      const response = await axios.get(
        `${SEMANTIC_SCHOLAR_API}/paper/DOI:${doi}`,
        {
          params: {
            fields: 'paperId,externalIds,title,abstract,venue,year,citationCount,authors,openAccessPdf,publicationDate,references',
          },
          timeout: 10000,
        }
      );

      const p = response.data;
      return {
        id: p.paperId,
        doi: p.externalIds?.DOI,
        title: p.title || 'Untitled',
        authors: (p.authors || []).map((a: any) => ({ name: a.name || 'Unknown' })),
        abstract: p.abstract,
        keywords: [],
        publicationDate: p.publicationDate,
        journal: p.venue,
        citationCount: p.citationCount || 0,
        source: 'semantic_scholar',
        openAccessUrl: p.openAccessPdf?.url,
        references: (p.references || []).map((r: any) => r.paperId).filter(Boolean),
      };
    } catch {
      return null;
    }
  }

  async getPaperById(id: string, source: string): Promise<Paper | null> {
    try {
      if (source === 'semantic_scholar') {
        const response = await axios.get(
          `${SEMANTIC_SCHOLAR_API}/paper/${id}`,
          {
            params: {
              fields: 'paperId,externalIds,title,abstract,venue,year,citationCount,authors,openAccessPdf,publicationDate,references',
            },
            timeout: 10000,
          }
        );
        const p = response.data;
        return {
          id: p.paperId,
          doi: p.externalIds?.DOI,
          title: p.title || 'Untitled',
          authors: (p.authors || []).map((a: any) => ({ name: a.name || 'Unknown' })),
          abstract: p.abstract,
          keywords: [],
          publicationDate: p.publicationDate,
          journal: p.venue,
          citationCount: p.citationCount || 0,
          source: 'semantic_scholar',
          openAccessUrl: p.openAccessPdf?.url,
          references: (p.references || []).map((r: any) => r.paperId).filter(Boolean),
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  // AI Analysis
  async analyzePaper(paper: Paper): Promise<Analysis | null> {
    if (!this.genAI) {
      console.log('  [AI] Gemini not configured, skipping analysis');
      return null;
    }

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const hasAbstract = paper.abstract && paper.abstract.length > 50;

    const prompt = `You are a research analyst. Analyze this academic paper for relevance to the research context.

Research Context: ${this.config.context || 'General academic research'}
Research Keywords: ${this.config.keywords.join(', ')}

Paper:
- Title: ${paper.title}
- Authors: ${paper.authors.map(a => a.name).join(', ')}
- Journal: ${paper.journal || 'Unknown'}
- Year: ${paper.publicationDate?.split('-')[0] || 'Unknown'}
- Citations: ${paper.citationCount}
- Keywords: ${paper.keywords.join(', ') || 'None'}
${hasAbstract ? `- Abstract: ${paper.abstract!.slice(0, 2000)}` : '- Abstract: Not available (analyze based on title, journal, and keywords)'}

Analyze this paper and respond in JSON format ONLY (no markdown, no explanation):
{
  "readingDecision": "must_read" | "should_read" | "maybe_read" | "skip",
  "readingReason": "Brief 1-2 sentence explanation of why this decision",
  "relevanceScore": 0.0-1.0,
  "abstractSummary": "2-3 sentence summary of what the paper is about",
  "keyFindings": ["finding1", "finding2", "finding3"],
  "methodologySummary": "Brief description of methods used",
  "limitations": ["limitation1", "limitation2"]
}`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error: any) {
      console.error(`  [AI] Analysis failed: ${error.message}`);
    }

    return null;
  }

  // PDF Download
  async downloadPdf(paper: Paper): Promise<string | null> {
    if (!this.config.downloadPdfs || !paper.openAccessUrl) {
      return null;
    }

    const filename = `${paper.doi?.replace(/\//g, '_') || paper.id}.pdf`;
    const filepath = path.join(this.pdfDir, filename);

    if (fs.existsSync(filepath)) {
      console.log(`  [PDF] Already exists: ${filename}`);
      return filepath;
    }

    try {
      console.log(`  [PDF] Downloading: ${filename}`);
      const response = await axios.get(paper.openAccessUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (response.headers['content-type']?.includes('pdf')) {
        fs.writeFileSync(filepath, response.data);
        console.log(`  [PDF] Downloaded: ${filename}`);
        return filepath;
      }
    } catch (error: any) {
      console.error(`  [PDF] Download failed: ${error.message}`);
    }

    return null;
  }

  // Main crawl logic
  async crawl(): Promise<void> {
    console.log('\n========================================');
    console.log('  ACADEMIC PAPER CRAWLER - STARTING');
    console.log('========================================\n');
    console.log(`Keywords: ${this.config.keywords.join(', ')}`);
    console.log(`Context: ${this.config.context}`);
    console.log(`Max Depth: ${this.config.maxDepth}`);
    console.log(`Papers per source: ${this.config.papersPerSource}`);
    console.log(`Download PDFs: ${this.config.downloadPdfs}`);
    console.log(`Output: ${this.config.outputDir}\n`);

    // Save query
    this.db.queries.push({
      keywords: this.config.keywords,
      context: this.config.context,
      createdAt: new Date().toISOString(),
    });

    const query = this.config.keywords.join(' ');

    // Phase 1: Initial search
    console.log('\n--- Phase 1: Initial Search ---\n');

    const [s2Papers, oaPapers, crPapers] = await Promise.all([
      this.searchSemanticScholar(query, this.config.papersPerSource),
      this.searchOpenAlex(query, this.config.papersPerSource),
      this.searchCrossRef(query, this.config.papersPerSource),
    ]);

    const allPapers = [...s2Papers, ...oaPapers, ...crPapers];
    console.log(`\nFound: S2=${s2Papers.length}, OA=${oaPapers.length}, CR=${crPapers.length}`);
    console.log(`Total: ${allPapers.length} papers`);

    // Deduplicate
    const uniquePapers: Paper[] = [];
    for (const paper of allPapers) {
      if (!this.isPaperProcessed(paper)) {
        const key = this.getPaperKey(paper);
        if (!uniquePapers.some(p => this.getPaperKey(p) === key)) {
          uniquePapers.push(paper);
        }
      }
    }
    console.log(`New unique papers: ${uniquePapers.length}`);

    // Sort by citation count
    uniquePapers.sort((a, b) => b.citationCount - a.citationCount);

    // Phase 2: Analyze and process
    console.log('\n--- Phase 2: Analysis & Processing ---\n');

    let processedCount = 0;
    const papersToFollow: AnalyzedPaper[] = [];

    for (const paper of uniquePapers) {
      processedCount++;
      console.log(`\n[${processedCount}/${uniquePapers.length}] ${paper.title.slice(0, 60)}...`);

      // Analyze with AI
      const analysis = await analyzePaperWithRetry(this, paper);

      // Download PDF
      const pdfPath = await this.downloadPdf(paper);

      // Create analyzed paper
      const analyzedPaper: AnalyzedPaper = {
        ...paper,
        analysis: analysis || undefined,
        pdfPath: pdfPath || undefined,
        analyzedAt: new Date().toISOString(),
        depth: 0,
      };

      // Save to database
      const key = this.getPaperKey(paper);
      this.db.papers[key] = analyzedPaper;
      this.saveDatabase();

      // Queue for reference following if relevant
      if (analysis && ['must_read', 'should_read'].includes(analysis.readingDecision)) {
        papersToFollow.push(analyzedPaper);
      }

      // Small delay to be nice to APIs
      await sleep(500);
    }

    // Phase 3: Follow references
    if (this.config.maxDepth > 0 && papersToFollow.length > 0) {
      console.log('\n--- Phase 3: Following References ---\n');
      await this.followReferences(papersToFollow, 1);
    }

    // Phase 4: Generate summary
    console.log('\n--- Phase 4: Generating Summary ---\n');
    await this.generateSummary();

    console.log('\n========================================');
    console.log('  CRAWLING COMPLETE!');
    console.log('========================================\n');
    console.log(`Total papers in database: ${Object.keys(this.db.papers).length}`);
    console.log(`Output directory: ${this.config.outputDir}`);
  }

  // Follow references recursively
  async followReferences(papers: AnalyzedPaper[], currentDepth: number): Promise<void> {
    if (currentDepth > this.config.maxDepth) return;

    console.log(`\nFollowing references at depth ${currentDepth}...`);

    const newPapers: AnalyzedPaper[] = [];
    let refCount = 0;

    for (const paper of papers) {
      if (!paper.references || paper.references.length === 0) continue;

      console.log(`\nProcessing refs from: ${paper.title.slice(0, 50)}...`);

      // Limit references per paper
      const refsToFollow = paper.references.slice(0, 5);

      for (const refId of refsToFollow) {
        refCount++;

        // Check if already processed
        const existingKey = Object.keys(this.db.papers).find(k =>
          this.db.papers[k].id === refId ||
          this.db.papers[k].doi === refId
        );

        if (existingKey) {
          console.log(`  [REF] Already processed: ${refId.slice(0, 20)}...`);
          continue;
        }

        // Fetch paper details
        let refPaper: Paper | null = null;
        if (refId.includes('/')) {
          // Looks like a DOI
          refPaper = await this.getPaperByDoi(refId);
        } else {
          // Likely a Semantic Scholar ID
          refPaper = await this.getPaperById(refId, 'semantic_scholar');
        }

        if (!refPaper) {
          console.log(`  [REF] Could not fetch: ${refId.slice(0, 20)}...`);
          continue;
        }

        console.log(`  [REF] Found: ${refPaper.title.slice(0, 50)}...`);

        // Analyze
        const analysis = await analyzePaperWithRetry(this, refPaper);

        // Download PDF
        const pdfPath = await this.downloadPdf(refPaper);

        const analyzedPaper: AnalyzedPaper = {
          ...refPaper,
          analysis: analysis || undefined,
          pdfPath: pdfPath || undefined,
          analyzedAt: new Date().toISOString(),
          depth: currentDepth,
        };

        // Save
        const key = this.getPaperKey(refPaper);
        this.db.papers[key] = analyzedPaper;
        this.saveDatabase();

        // Queue for deeper following if relevant
        if (analysis && ['must_read', 'should_read'].includes(analysis.readingDecision)) {
          newPapers.push(analyzedPaper);
        }

        await sleep(1000); // Be nice to APIs
      }
    }

    console.log(`\nProcessed ${refCount} references at depth ${currentDepth}`);
    console.log(`Found ${newPapers.length} new relevant papers`);

    // Recurse
    if (newPapers.length > 0 && currentDepth < this.config.maxDepth) {
      await this.followReferences(newPapers, currentDepth + 1);
    }
  }

  // Generate research summary
  async generateSummary(): Promise<void> {
    const papers = Object.values(this.db.papers);

    if (papers.length === 0) {
      console.log('No papers to summarize');
      return;
    }

    // Group by decision
    const byDecision = {
      must_read: papers.filter(p => p.analysis?.readingDecision === 'must_read'),
      should_read: papers.filter(p => p.analysis?.readingDecision === 'should_read'),
      maybe_read: papers.filter(p => p.analysis?.readingDecision === 'maybe_read'),
      skip: papers.filter(p => p.analysis?.readingDecision === 'skip'),
      unanalyzed: papers.filter(p => !p.analysis),
    };

    // Create summary report
    let summary = `# Research Summary Report

Generated: ${new Date().toISOString()}

## Overview

- **Keywords**: ${this.config.keywords.join(', ')}
- **Context**: ${this.config.context}
- **Total Papers**: ${papers.length}
- **Must Read**: ${byDecision.must_read.length}
- **Should Read**: ${byDecision.should_read.length}
- **Maybe Read**: ${byDecision.maybe_read.length}
- **Skip**: ${byDecision.skip.length}
- **Unanalyzed**: ${byDecision.unanalyzed.length}

## Must Read Papers

${byDecision.must_read.map(p => `### ${p.title}
- **Authors**: ${p.authors.map(a => a.name).join(', ')}
- **Journal**: ${p.journal || 'Unknown'}
- **Year**: ${p.publicationDate?.split('-')[0] || 'Unknown'}
- **Citations**: ${p.citationCount}
- **Relevance**: ${(p.analysis?.relevanceScore || 0) * 100}%
- **Summary**: ${p.analysis?.abstractSummary || 'N/A'}
- **Key Findings**: ${p.analysis?.keyFindings?.join('; ') || 'N/A'}
- **DOI**: ${p.doi ? `https://doi.org/${p.doi}` : 'N/A'}
${p.pdfPath ? `- **PDF**: ${p.pdfPath}` : ''}
`).join('\n')}

## Should Read Papers

${byDecision.should_read.map(p => `### ${p.title}
- **Authors**: ${p.authors.slice(0, 3).map(a => a.name).join(', ')}${p.authors.length > 3 ? ' et al.' : ''}
- **Year**: ${p.publicationDate?.split('-')[0] || 'Unknown'}
- **Citations**: ${p.citationCount}
- **Relevance**: ${(p.analysis?.relevanceScore || 0) * 100}%
- **Reason**: ${p.analysis?.readingReason || 'N/A'}
- **DOI**: ${p.doi ? `https://doi.org/${p.doi}` : 'N/A'}
`).join('\n')}

## Key Themes & Findings

Based on the analyzed papers, here are the common themes and findings:

${this.extractThemes(papers)}

## Recommendations

1. Start with the "Must Read" papers for foundational understanding
2. Use "Should Read" papers to deepen specific areas
3. Reference tracking depth: ${this.config.maxDepth} levels

---
*Generated by Scopus AI Crawler*
`;

    // Save summary
    const summaryPath = path.join(this.config.outputDir, 'research-summary.md');
    fs.writeFileSync(summaryPath, summary);
    console.log(`Summary saved to: ${summaryPath}`);

    // Also generate JSON export
    const exportData = {
      config: this.config,
      summary: {
        totalPapers: papers.length,
        byDecision: {
          must_read: byDecision.must_read.length,
          should_read: byDecision.should_read.length,
          maybe_read: byDecision.maybe_read.length,
          skip: byDecision.skip.length,
          unanalyzed: byDecision.unanalyzed.length,
        },
      },
      papers: papers.map(p => ({
        title: p.title,
        authors: p.authors.map(a => a.name),
        doi: p.doi,
        year: p.publicationDate?.split('-')[0],
        citations: p.citationCount,
        decision: p.analysis?.readingDecision || 'unanalyzed',
        relevance: p.analysis?.relevanceScore,
        summary: p.analysis?.abstractSummary,
        pdfPath: p.pdfPath,
      })),
    };

    const exportPath = path.join(this.config.outputDir, 'research-export.json');
    fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
    console.log(`Export saved to: ${exportPath}`);

    // Generate AI summary if available
    if (this.genAI && byDecision.must_read.length > 0) {
      await this.generateAISummary(byDecision);
    }
  }

  private extractThemes(papers: AnalyzedPaper[]): string {
    const allKeywords: Record<string, number> = {};
    const allFindings: string[] = [];

    for (const paper of papers) {
      // Count keywords
      for (const kw of paper.keywords) {
        allKeywords[kw] = (allKeywords[kw] || 0) + 1;
      }
      // Collect findings
      if (paper.analysis?.keyFindings) {
        allFindings.push(...paper.analysis.keyFindings);
      }
    }

    // Top keywords
    const topKeywords = Object.entries(allKeywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([kw, count]) => `- ${kw} (${count} papers)`)
      .join('\n');

    return `**Common Keywords:**\n${topKeywords || 'N/A'}\n\n**Sample Findings:**\n${allFindings.slice(0, 10).map(f => `- ${f}`).join('\n') || 'N/A'}`;
  }

  private async generateAISummary(byDecision: Record<string, AnalyzedPaper[]>): Promise<void> {
    if (!this.genAI) return;

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const mustReadSummaries = byDecision.must_read
      .slice(0, 10)
      .map(p => `- "${p.title}": ${p.analysis?.abstractSummary || p.abstract?.slice(0, 200)}`)
      .join('\n');

    const prompt = `Based on these top academic papers found for research on "${this.config.context}":

${mustReadSummaries}

Please provide:
1. A 2-3 paragraph synthesis of the key themes and findings across these papers
2. 3-5 key research gaps or opportunities
3. Suggested next steps for the researcher

Respond in plain text (no JSON).`;

    try {
      const result = await model.generateContent(prompt);
      const synthesis = result.response.text();

      // Append to summary
      const summaryPath = path.join(this.config.outputDir, 'research-summary.md');
      const existing = fs.readFileSync(summaryPath, 'utf-8');

      const aiSection = `\n\n## AI Research Synthesis\n\n${synthesis}\n`;
      fs.writeFileSync(summaryPath, existing + aiSection);

      console.log('AI synthesis added to summary');
    } catch (error: any) {
      console.error(`AI synthesis failed: ${error.message}`);
    }
  }

  // Public method for external analysis
  async analyzeExternalPaper(paper: Paper): Promise<Analysis | null> {
    return this.analyzePaper(paper);
  }
}

// Helper functions
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzePaperWithRetry(
  crawler: AcademicCrawler,
  paper: Paper,
  maxRetries = 2
): Promise<Analysis | null> {
  for (let i = 0; i < maxRetries; i++) {
    const result = await crawler.analyzeExternalPaper(paper);
    if (result) return result;
    await sleep(1000);
  }
  return null;
}

// Export for use
export { AcademicCrawler, CrawlerConfig, Paper, AnalyzedPaper, Analysis };
