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
}

interface Analysis {
  readingDecision: string;
  readingReason: string;
  relevanceScore: number;
  abstractSummary: string;
  keyFindings: string[];
}

async function searchSemanticScholar(query: string, limit: number = 20): Promise<Paper[]> {
  const fields = 'paperId,externalIds,title,abstract,venue,year,citationCount,authors,openAccessPdf,publicationDate';

  const response = await fetch(
    `${SEMANTIC_SCHOLAR_API}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`,
    { headers: { 'Accept': 'application/json' } }
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
  }));
}

async function searchOpenAlex(query: string, limit: number = 20): Promise<Paper[]> {
  const response = await fetch(
    `${OPENALEX_API}/works?search=${encodeURIComponent(query)}&per_page=${limit}&sort=cited_by_count:desc`,
    { headers: { 'User-Agent': 'ScopusAICrawler/1.0' } }
  );

  if (!response.ok) return [];

  const data = await response.json();
  return (data.results || []).map((w: any) => {
    // Reconstruct abstract from inverted index
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
    };
  });
}

async function searchCrossRef(query: string, limit: number = 20): Promise<Paper[]> {
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
      abstract: w.abstract,
      keywords: w.subject || [],
      publicationDate,
      journal: w['container-title']?.[0],
      citationCount: w['is-referenced-by-count'] || 0,
      source: 'crossref',
      openAccessUrl: w.link?.find((l: any) => l['content-type'] === 'application/pdf')?.URL,
    };
  });
}

async function analyzeWithGemini(paper: Paper, context: string): Promise<Analysis | null> {
  if (!GEMINI_API_KEY) return null;

  const prompt = `
You are a research analyst. Analyze this academic paper for relevance.

Research Context: ${context || 'General academic research'}

Paper:
- Title: ${paper.title}
- Authors: ${paper.authors.map(a => a.name).join(', ')}
- Journal: ${paper.journal || 'Unknown'}
- Citations: ${paper.citationCount}
- Abstract: ${paper.abstract?.slice(0, 1000) || 'No abstract'}

Respond in JSON format only:
{
  "readingDecision": "must_read" | "should_read" | "maybe_read" | "skip",
  "readingReason": "brief explanation",
  "relevanceScore": 0.0-1.0,
  "abstractSummary": "2-3 sentence summary",
  "keyFindings": ["finding1", "finding2"]
}
`;

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
  } catch (error) {
    console.error('Gemini analysis failed:', error);
  }

  return null;
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
      // Merge: prefer higher citation count
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
    }
  }

  return Array.from(seen.values());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keywords, context, limit = 15 } = body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'Keywords array is required' }, { status: 400 });
    }

    const query = keywords.join(' ');
    const perSource = Math.ceil(limit / 3);

    // Search all APIs in parallel
    const [s2Papers, oaPapers, crPapers] = await Promise.all([
      searchSemanticScholar(query, perSource),
      searchOpenAlex(query, perSource),
      searchCrossRef(query, perSource),
    ]);

    console.log(`Found: S2=${s2Papers.length}, OA=${oaPapers.length}, CR=${crPapers.length}`);

    // Combine and deduplicate
    const allPapers = [...s2Papers, ...oaPapers, ...crPapers];
    const uniquePapers = deduplicatePapers(allPapers);

    // Sort by citation count
    uniquePapers.sort((a, b) => b.citationCount - a.citationCount);

    // Limit results
    const topPapers = uniquePapers.slice(0, limit);

    // Analyze top papers with Gemini (limit to top 10 to save API calls)
    const papersToAnalyze = topPapers.slice(0, 10);
    const analyzedPapers = await Promise.all(
      papersToAnalyze.map(async (paper) => {
        const analysis = await analyzeWithGemini(paper, context || '');
        return { ...paper, analysis };
      })
    );

    // Add remaining papers without analysis
    const remainingPapers = topPapers.slice(10).map((paper) => ({
      ...paper,
      analysis: null,
    }));

    return NextResponse.json({
      papers: [...analyzedPapers, ...remainingPapers],
      totalFound: allPapers.length,
      uniqueCount: uniquePapers.length,
      sources: {
        semanticScholar: s2Papers.length,
        openAlex: oaPapers.length,
        crossRef: crPapers.length,
      },
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
