export interface Author {
  name: string;
  affiliation?: string;
  orcid?: string;
}

export interface Analysis {
  readingDecision: 'must_read' | 'should_read' | 'maybe_read' | 'skip';
  readingReason: string;
  relevanceScore: number;
  abstractSummary: string;
  keyFindings: string[];
}

export interface Paper {
  id: string;
  doi?: string;
  title: string;
  authors: Author[];
  abstract?: string;
  keywords: string[];
  publicationDate?: string;
  journal?: string;
  citationCount: number;
  openAccessUrl?: string;
  source: string;
  analysis?: Analysis | null;
}

export interface SearchResult {
  papers: Paper[];
  totalFound: number;
  uniqueCount: number;
  sources: {
    semanticScholar: number;
    openAlex: number;
    crossRef: number;
  };
}

export async function searchPapers(params: {
  keywords: string[];
  context?: string;
  limit?: number;
}): Promise<SearchResult> {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error('Search failed');
  }

  return response.json();
}
