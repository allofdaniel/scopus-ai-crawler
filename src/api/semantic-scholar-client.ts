import { BaseApiClient } from './base-client.js';
import { config } from '../config/index.js';
import { Paper, Author } from '../types/paper.js';
import { v4 as uuidv4 } from 'uuid';

interface S2SearchResult {
  total: number;
  offset: number;
  next?: number;
  data: S2Paper[];
}

interface S2Paper {
  paperId: string;
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
    PubMed?: string;
  };
  title?: string;
  abstract?: string;
  venue?: string;
  year?: number;
  referenceCount?: number;
  citationCount?: number;
  influentialCitationCount?: number;
  isOpenAccess?: boolean;
  openAccessPdf?: {
    url?: string;
    status?: string;
  };
  authors?: {
    authorId?: string;
    name?: string;
  }[];
  fieldsOfStudy?: string[];
  s2FieldsOfStudy?: {
    category: string;
    source: string;
  }[];
  publicationDate?: string;
  journal?: {
    name?: string;
    volume?: string;
    pages?: string;
  };
  references?: S2Reference[];
  citations?: S2Reference[];
}

interface S2Reference {
  paperId?: string;
  title?: string;
  externalIds?: {
    DOI?: string;
  };
  citationCount?: number;
  influentialCitationCount?: number;
}

export class SemanticScholarClient extends BaseApiClient {
  constructor() {
    const headers: Record<string, string> = {};
    if (config.semanticScholarApiKey) {
      headers['x-api-key'] = config.semanticScholarApiKey;
    }

    super(
      'https://api.semanticscholar.org/graph/v1',
      { requestsPerSecond: config.rateLimits.semanticScholar },
      headers
    );
  }

  async search(query: string, options: {
    offset?: number;
    limit?: number;
    year?: string;
    fieldsOfStudy?: string[];
    minCitationCount?: number;
  } = {}): Promise<{ papers: Paper[]; totalResults: number; next?: number }> {
    const { offset = 0, limit = 100, year, fieldsOfStudy, minCitationCount } = options;

    const fields = [
      'paperId',
      'externalIds',
      'title',
      'abstract',
      'venue',
      'year',
      'referenceCount',
      'citationCount',
      'influentialCitationCount',
      'isOpenAccess',
      'openAccessPdf',
      'authors',
      'fieldsOfStudy',
      's2FieldsOfStudy',
      'publicationDate',
      'journal',
    ].join(',');

    const params: Record<string, unknown> = {
      query,
      offset,
      limit,
      fields,
    };

    if (year) params.year = year;
    if (fieldsOfStudy?.length) params.fieldsOfStudy = fieldsOfStudy.join(',');
    if (minCitationCount) params.minCitationCount = minCitationCount;

    const result = await this.request<S2SearchResult>({
      method: 'GET',
      url: '/paper/search',
      params,
    });

    const papers = result.data.map((paper) => this.mapToPaper(paper));

    return {
      papers,
      totalResults: result.total,
      next: result.next,
    };
  }

  async getPaperDetails(paperId: string): Promise<Paper | null> {
    try {
      const fields = [
        'paperId',
        'externalIds',
        'title',
        'abstract',
        'venue',
        'year',
        'referenceCount',
        'citationCount',
        'influentialCitationCount',
        'isOpenAccess',
        'openAccessPdf',
        'authors',
        'fieldsOfStudy',
        's2FieldsOfStudy',
        'publicationDate',
        'journal',
        'references.paperId',
        'references.externalIds',
        'references.title',
        'references.citationCount',
      ].join(',');

      const result = await this.request<S2Paper>({
        method: 'GET',
        url: `/paper/${paperId}`,
        params: { fields },
      });

      return this.mapToPaper(result);
    } catch (error) {
      console.error(`Failed to get paper ${paperId}:`, error);
      return null;
    }
  }

  async getPaperReferences(paperId: string, options: {
    offset?: number;
    limit?: number;
  } = {}): Promise<{ references: Paper[]; total: number }> {
    const { offset = 0, limit = 100 } = options;

    const fields = [
      'paperId',
      'externalIds',
      'title',
      'abstract',
      'citationCount',
      'influentialCitationCount',
      'year',
      'authors',
    ].join(',');

    interface ReferencesResult {
      offset: number;
      data: { citedPaper: S2Paper }[];
    }

    const result = await this.request<ReferencesResult>({
      method: 'GET',
      url: `/paper/${paperId}/references`,
      params: { offset, limit, fields },
    });

    const references = result.data
      .filter((r) => r.citedPaper?.paperId)
      .map((r) => this.mapToPaper(r.citedPaper));

    return {
      references,
      total: result.data.length,
    };
  }

  async getPaperCitations(paperId: string, options: {
    offset?: number;
    limit?: number;
  } = {}): Promise<{ citations: Paper[]; total: number }> {
    const { offset = 0, limit = 100 } = options;

    const fields = [
      'paperId',
      'externalIds',
      'title',
      'abstract',
      'citationCount',
      'influentialCitationCount',
      'year',
      'authors',
    ].join(',');

    interface CitationsResult {
      offset: number;
      data: { citingPaper: S2Paper }[];
    }

    const result = await this.request<CitationsResult>({
      method: 'GET',
      url: `/paper/${paperId}/citations`,
      params: { offset, limit, fields },
    });

    const citations = result.data
      .filter((r) => r.citingPaper?.paperId)
      .map((r) => this.mapToPaper(r.citingPaper));

    return {
      citations,
      total: result.data.length,
    };
  }

  async searchByDOI(doi: string): Promise<Paper | null> {
    return this.getPaperDetails(`DOI:${doi}`);
  }

  private mapToPaper(s2Paper: S2Paper): Paper {
    const authors: Author[] = (s2Paper.authors || []).map((a) => ({
      name: a.name || 'Unknown',
    }));

    const keywords = [
      ...(s2Paper.fieldsOfStudy || []),
      ...(s2Paper.s2FieldsOfStudy || []).map((f) => f.category),
    ];

    const references = (s2Paper.references || [])
      .map((r) => r.externalIds?.DOI || r.paperId)
      .filter((r): r is string => !!r);

    return {
      id: uuidv4(),
      doi: s2Paper.externalIds?.DOI,
      semanticScholarId: s2Paper.paperId,
      title: s2Paper.title || 'Untitled',
      authors,
      abstract: s2Paper.abstract,
      keywords: [...new Set(keywords)],
      publicationDate: s2Paper.publicationDate || (s2Paper.year ? `${s2Paper.year}-01-01` : undefined),
      journal: s2Paper.journal?.name || s2Paper.venue,
      volume: s2Paper.journal?.volume,
      pages: s2Paper.journal?.pages,
      citationCount: s2Paper.citationCount || 0,
      referenceCount: s2Paper.referenceCount || 0,
      influentialCitationCount: s2Paper.influentialCitationCount,
      openAccessUrl: s2Paper.openAccessPdf?.url,
      references,
      source: 'semantic_scholar',
      discoveredAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }
}
