const API_BASE = '/api';

export interface Author {
  name: string;
  affiliation?: string;
  orcid?: string;
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
  analysis?: {
    readingDecision: 'must_read' | 'should_read' | 'maybe_read' | 'skip';
    relevanceScore: number;
    abstractSummary: string;
    readingReason: string;
  };
}

export interface PaperDetails extends Paper {
  scopusId?: string;
  semanticScholarId?: string;
  openAlexId?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  referenceCount: number;
  influentialCitationCount?: number;
  pdfUrl?: string;
  publisherUrl?: string;
  references: string[];
  source: string;
  discoveredAt: string;
  lastUpdated: string;
  analysis?: {
    readingDecision: 'must_read' | 'should_read' | 'maybe_read' | 'skip';
    readingReason: string;
    confidenceScore: number;
    abstractSummary: string;
    keyFindings: string[];
    methodology?: string;
    limitations?: string[];
    relevanceScore: number;
    relevanceTopics: string[];
    suggestedActions: string[];
    importantReferences: string[];
    analyzedAt: string;
  };
}

export interface SearchQuery {
  id: string;
  keywords: string[];
  field?: string;
  dateFrom?: string;
  dateTo?: string;
  minCitations?: number;
  includeReferences: boolean;
  maxReferenceDepth: number;
  createdAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  paperCount: number;
}

export interface Stats {
  totalPapers: number;
  totalQueries: number;
  analyzedPapers: number;
  decisionBreakdown: Record<string, number>;
}

export async function createQuery(params: {
  keywords: string[];
  context?: string;
  field?: string;
  dateFrom?: string;
  dateTo?: string;
  minCitations?: number;
  includeReferences?: boolean;
  maxReferenceDepth?: number;
}): Promise<{ id: string; status: string; message: string }> {
  const response = await fetch(`${API_BASE}/queries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error('Failed to create query');
  }

  return response.json();
}

export async function getQueries(): Promise<SearchQuery[]> {
  const response = await fetch(`${API_BASE}/queries`);
  if (!response.ok) {
    throw new Error('Failed to fetch queries');
  }
  return response.json();
}

export async function getQuery(id: string): Promise<SearchQuery> {
  const response = await fetch(`${API_BASE}/queries/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch query');
  }
  return response.json();
}

export async function getPapersForQuery(
  queryId: string,
  options: {
    decision?: string;
    sort?: 'relevance' | 'citations' | 'date';
    limit?: number;
    offset?: number;
  } = {}
): Promise<Paper[]> {
  const params = new URLSearchParams();
  if (options.decision) params.set('decision', options.decision);
  if (options.sort) params.set('sort', options.sort);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  const response = await fetch(`${API_BASE}/queries/${queryId}/papers?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch papers');
  }
  return response.json();
}

export async function getPaper(id: string): Promise<PaperDetails> {
  const response = await fetch(`${API_BASE}/papers/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch paper');
  }
  return response.json();
}

export async function getStats(): Promise<Stats> {
  const response = await fetch(`${API_BASE}/stats`);
  if (!response.ok) {
    throw new Error('Failed to fetch stats');
  }
  return response.json();
}

export async function getQuerySummary(queryId: string): Promise<{ summary: string }> {
  const response = await fetch(`${API_BASE}/queries/${queryId}/summary`);
  if (!response.ok) {
    throw new Error('Failed to fetch summary');
  }
  return response.json();
}
