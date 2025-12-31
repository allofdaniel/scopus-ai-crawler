import { NextRequest, NextResponse } from 'next/server';

const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1';
const OPENALEX_API = 'https://api.openalex.org';
const CROSSREF_API = 'https://api.crossref.org';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
  references?: string[];
}

interface Analysis {
  readingDecision: 'must_read' | 'should_read' | 'maybe_read' | 'skip';
  readingReason: string;
  relevanceScore: number;
  abstractSummary: string;
  keyFindings: string[];
}

interface AnalyzedPaper extends Paper {
  analysis?: Analysis;
  depth: number;
}

// In-memory store for this session
let crawlState: {
  isRunning: boolean;
  progress: number;
  totalPapers: number;
  processedPapers: number;
  papers: AnalyzedPaper[];
  summary?: string;
  error?: string;
} = {
  isRunning: false,
  progress: 0,
  totalPapers: 0,
  processedPapers: 0,
  papers: [],
};

async function searchSemanticScholar(query: string, limit: number): Promise<Paper[]> {
  const fields = 'paperId,externalIds,title,abstract,venue,year,citationCount,authors,openAccessPdf,publicationDate,references';
  try {
    const response = await fetch(
      `${SEMANTIC_SCHOLAR_API}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((p: any) => ({
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
      references: (p.references || []).slice(0, 10).map((r: any) => r.paperId).filter(Boolean),
    }));
  } catch {
    return [];
  }
}

async function searchOpenAlex(query: string, limit: number): Promise<Paper[]> {
  try {
    const response = await fetch(
      `${OPENALEX_API}/works?search=${encodeURIComponent(query)}&per_page=${limit}&sort=cited_by_count:desc`,
      { headers: { 'User-Agent': 'ScopusAICrawler/1.0' } }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.results || []).map((w: any) => {
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
        authors: (w.authorships || []).slice(0, 5).map((a: any) => ({
          name: a.author?.display_name || 'Unknown',
        })),
        abstract,
        keywords: (w.concepts || []).slice(0, 5).map((c: any) => c.display_name),
        publicationDate: w.publication_date,
        journal: w.primary_location?.source?.display_name,
        citationCount: w.cited_by_count || 0,
        source: 'openalex',
        openAccessUrl: w.open_access?.oa_url,
        references: (w.referenced_works || []).slice(0, 10).map((r: string) => r.replace('https://openalex.org/', '')),
      };
    });
  } catch {
    return [];
  }
}

async function searchCrossRef(query: string, limit: number): Promise<Paper[]> {
  try {
    const response = await fetch(
      `${CROSSREF_API}/works?query=${encodeURIComponent(query)}&rows=${limit}&sort=is-referenced-by-count&order=desc`,
      { headers: { 'User-Agent': 'ScopusAICrawler/1.0' } }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.message?.items || []).map((w: any) => {
      let publicationDate: string | undefined;
      if (w.issued?.['date-parts']?.[0]) {
        const [year, month = 1, day = 1] = w.issued['date-parts'][0];
        publicationDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return {
        id: w.DOI || Math.random().toString(36).slice(2),
        doi: w.DOI,
        title: w.title?.[0] || 'Untitled',
        authors: (w.author || []).slice(0, 5).map((a: any) => ({
          name: a.name || `${a.given || ''} ${a.family || ''}`.trim() || 'Unknown',
        })),
        abstract: w.abstract?.replace(/<[^>]*>/g, ''),
        keywords: w.subject || [],
        publicationDate,
        journal: w['container-title']?.[0],
        citationCount: w['is-referenced-by-count'] || 0,
        source: 'crossref',
        openAccessUrl: w.link?.find((l: any) => l['content-type'] === 'application/pdf')?.URL,
        references: (w.reference || []).slice(0, 10).map((r: any) => r.DOI).filter(Boolean),
      };
    });
  } catch {
    return [];
  }
}

async function analyzeWithGemini(paper: Paper, context: string): Promise<Analysis | null> {
  if (!GEMINI_API_KEY) return null;

  const hasAbstract = paper.abstract && paper.abstract.length > 50;
  const prompt = `You are a research analyst. Analyze this academic paper for relevance.

Research Context: ${context || 'General academic research'}

Paper:
- Title: ${paper.title}
- Authors: ${paper.authors.map(a => a.name).join(', ')}
- Journal: ${paper.journal || 'Unknown'}
- Citations: ${paper.citationCount}
- Keywords: ${paper.keywords.join(', ') || 'None'}
${hasAbstract ? `- Abstract: ${paper.abstract!.slice(0, 1500)}` : '- Abstract: Not available (analyze based on title and journal)'}

Respond in JSON format only:
{
  "readingDecision": "must_read" | "should_read" | "maybe_read" | "skip",
  "readingReason": "brief explanation",
  "relevanceScore": 0.0-1.0,
  "abstractSummary": "2-3 sentence summary",
  "keyFindings": ["finding1", "finding2"]
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 },
        }),
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // ignore
  }
  return null;
}

async function getPaperByDoi(doi: string): Promise<Paper | null> {
  try {
    const response = await fetch(
      `${SEMANTIC_SCHOLAR_API}/paper/DOI:${doi}?fields=paperId,externalIds,title,abstract,venue,year,citationCount,authors,openAccessPdf,publicationDate,references`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return null;
    const p = await response.json();
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
      references: (p.references || []).slice(0, 5).map((r: any) => r.paperId).filter(Boolean),
    };
  } catch {
    return null;
  }
}

function deduplicatePapers(papers: Paper[]): Paper[] {
  const seen = new Map<string, Paper>();
  for (const paper of papers) {
    const key = paper.doi
      ? `doi:${paper.doi.toLowerCase()}`
      : `title:${paper.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (!seen.has(key)) {
      seen.set(key, paper);
    } else {
      const existing = seen.get(key)!;
      if (paper.citationCount > existing.citationCount) {
        existing.citationCount = paper.citationCount;
      }
      if (!existing.abstract && paper.abstract) {
        existing.abstract = paper.abstract;
      }
      if (!existing.openAccessUrl && paper.openAccessUrl) {
        existing.openAccessUrl = paper.openAccessUrl;
      }
      if (!existing.references && paper.references) {
        existing.references = paper.references;
      }
    }
  }
  return Array.from(seen.values());
}

async function generateSummary(papers: AnalyzedPaper[], context: string): Promise<string> {
  if (!GEMINI_API_KEY) return '';

  const mustRead = papers.filter(p => p.analysis?.readingDecision === 'must_read');
  const shouldRead = papers.filter(p => p.analysis?.readingDecision === 'should_read');

  const topPapers = [...mustRead, ...shouldRead].slice(0, 10);
  if (topPapers.length === 0) return '';

  const papersSummary = topPapers.map(p =>
    `- "${p.title}" (${p.citationCount} citations): ${p.analysis?.abstractSummary || 'No summary'}`
  ).join('\n');

  const prompt = `Based on these top academic papers for research on "${context}":

${papersSummary}

Provide a 2-3 paragraph synthesis of the key themes, findings, and research directions. Include practical recommendations for the researcher.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5 },
        }),
      }
    );
    if (!response.ok) return '';
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch {
    return '';
  }
}

// POST: Start crawl
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keywords, context, maxDepth = 1, papersPerSource = 15 } = body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'Keywords array is required' }, { status: 400 });
    }

    // Reset state
    crawlState = {
      isRunning: true,
      progress: 0,
      totalPapers: 0,
      processedPapers: 0,
      papers: [],
    };

    const query = keywords.join(' ');
    const processedKeys = new Set<string>();

    // Phase 1: Initial search
    const [s2Papers, oaPapers, crPapers] = await Promise.all([
      searchSemanticScholar(query, papersPerSource),
      searchOpenAlex(query, papersPerSource),
      searchCrossRef(query, papersPerSource),
    ]);

    const allPapers = deduplicatePapers([...s2Papers, ...oaPapers, ...crPapers]);
    allPapers.sort((a, b) => b.citationCount - a.citationCount);

    crawlState.totalPapers = allPapers.length;

    // Phase 2: Analyze papers
    const analyzedPapers: AnalyzedPaper[] = [];
    const toFollow: AnalyzedPaper[] = [];

    for (let i = 0; i < allPapers.length; i++) {
      const paper = allPapers[i];
      const key = paper.doi ? `doi:${paper.doi.toLowerCase()}` : `title:${paper.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

      if (processedKeys.has(key)) continue;
      processedKeys.add(key);

      const analysis = await analyzeWithGemini(paper, context);
      const analyzed: AnalyzedPaper = { ...paper, analysis: analysis || undefined, depth: 0 };
      analyzedPapers.push(analyzed);

      if (analysis && ['must_read', 'should_read'].includes(analysis.readingDecision)) {
        toFollow.push(analyzed);
      }

      crawlState.processedPapers = i + 1;
      crawlState.progress = Math.round((i + 1) / allPapers.length * 50);
      crawlState.papers = [...analyzedPapers];

      // Small delay
      await new Promise(r => setTimeout(r, 200));
    }

    // Phase 3: Follow references (depth 1)
    if (maxDepth > 0 && toFollow.length > 0) {
      const allRefs: string[] = [];
      for (const p of toFollow.slice(0, 5)) {
        if (p.references) {
          allRefs.push(...p.references.slice(0, 3));
        }
      }

      const uniqueRefs = Array.from(new Set(allRefs)).slice(0, 10);
      crawlState.totalPapers += uniqueRefs.length;

      for (let i = 0; i < uniqueRefs.length; i++) {
        const refId = uniqueRefs[i];
        if (processedKeys.has(`ref:${refId}`)) continue;
        processedKeys.add(`ref:${refId}`);

        // Try to fetch by DOI
        let refPaper: Paper | null = null;
        if (refId.includes('/')) {
          refPaper = await getPaperByDoi(refId);
        }

        if (refPaper) {
          const key = refPaper.doi ? `doi:${refPaper.doi.toLowerCase()}` : `title:${refPaper.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
          if (!processedKeys.has(key)) {
            processedKeys.add(key);
            const analysis = await analyzeWithGemini(refPaper, context);
            const analyzed: AnalyzedPaper = { ...refPaper, analysis: analysis || undefined, depth: 1 };
            analyzedPapers.push(analyzed);
          }
        }

        crawlState.progress = 50 + Math.round((i + 1) / uniqueRefs.length * 40);
        crawlState.papers = [...analyzedPapers];

        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Phase 4: Generate summary
    crawlState.progress = 90;
    const summary = await generateSummary(analyzedPapers, context);

    // Sort final results
    analyzedPapers.sort((a, b) => {
      const decisionOrder: Record<string, number> = { must_read: 0, should_read: 1, maybe_read: 2, skip: 3 };
      const aOrder = a.analysis ? decisionOrder[a.analysis.readingDecision] ?? 4 : 4;
      const bOrder = b.analysis ? decisionOrder[b.analysis.readingDecision] ?? 4 : 4;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.citationCount - a.citationCount;
    });

    crawlState = {
      isRunning: false,
      progress: 100,
      totalPapers: analyzedPapers.length,
      processedPapers: analyzedPapers.length,
      papers: analyzedPapers,
      summary,
    };

    // Return results
    const byDecision = {
      must_read: analyzedPapers.filter(p => p.analysis?.readingDecision === 'must_read').length,
      should_read: analyzedPapers.filter(p => p.analysis?.readingDecision === 'should_read').length,
      maybe_read: analyzedPapers.filter(p => p.analysis?.readingDecision === 'maybe_read').length,
      skip: analyzedPapers.filter(p => p.analysis?.readingDecision === 'skip').length,
      unanalyzed: analyzedPapers.filter(p => !p.analysis).length,
    };

    return NextResponse.json({
      papers: analyzedPapers,
      summary,
      stats: {
        total: analyzedPapers.length,
        byDecision,
        byDepth: {
          initial: analyzedPapers.filter(p => p.depth === 0).length,
          fromReferences: analyzedPapers.filter(p => p.depth > 0).length,
        },
      },
    });
  } catch (error: any) {
    crawlState.isRunning = false;
    crawlState.error = error.message;
    return NextResponse.json({ error: 'Crawl failed: ' + error.message }, { status: 500 });
  }
}

// GET: Check status
export async function GET() {
  return NextResponse.json(crawlState);
}
