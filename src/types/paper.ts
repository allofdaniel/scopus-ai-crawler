export interface Author {
  name: string;
  affiliation?: string;
  orcid?: string;
}

export interface Paper {
  id: string; // Internal UUID
  doi?: string;
  scopusId?: string;
  semanticScholarId?: string;
  openAlexId?: string;

  // Basic Info
  title: string;
  authors: Author[];
  abstract?: string;
  keywords: string[];
  publicationDate?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;

  // Metrics
  citationCount: number;
  referenceCount: number;
  influentialCitationCount?: number;

  // URLs
  pdfUrl?: string;
  openAccessUrl?: string;
  publisherUrl?: string;

  // References (DOIs or IDs)
  references: string[];

  // Source of discovery
  source: 'scopus' | 'semantic_scholar' | 'openalex' | 'crossref';
  discoveredAt: string;
  lastUpdated: string;
}

export interface AIAnalysis {
  paperId: string;

  // Reading Decision
  readingDecision: 'must_read' | 'should_read' | 'maybe_read' | 'skip';
  readingReason: string;
  confidenceScore: number; // 0-1

  // Content Summary
  abstractSummary: string;
  keyFindings: string[];
  methodology?: string;
  limitations?: string[];

  // Relevance
  relevanceScore: number; // 0-1
  relevanceTopics: string[];

  // Next Steps
  suggestedActions: ('read_full' | 'check_figures' | 'follow_references' | 'cite' | 'archive')[];
  importantReferences: string[]; // DOIs worth following

  // Meta
  analysisVersion: string;
  analyzedAt: string;
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

export interface CrawlSession {
  id: string;
  queryId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  papersFound: number;
  papersAnalyzed: number;
  errors: string[];
}
