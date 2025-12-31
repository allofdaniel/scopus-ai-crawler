import { BaseApiClient } from './base-client.js';
import { config } from '../config/index.js';
import { Paper, Author } from '../types/paper.js';
import { v4 as uuidv4 } from 'uuid';

interface CrossRefSearchResult {
  status: string;
  'message-type': string;
  'message-version': string;
  message: {
    'total-results': number;
    items: CrossRefWork[];
    'items-per-page': number;
    query: {
      'start-index': number;
      'search-terms': string;
    };
  };
}

interface CrossRefWork {
  DOI: string;
  title?: string[];
  author?: {
    given?: string;
    family?: string;
    name?: string;
    ORCID?: string;
    affiliation?: { name: string }[];
  }[];
  abstract?: string;
  'container-title'?: string[];
  publisher?: string;
  issued?: {
    'date-parts'?: number[][];
  };
  volume?: string;
  issue?: string;
  page?: string;
  'is-referenced-by-count'?: number;
  'references-count'?: number;
  reference?: {
    DOI?: string;
    'article-title'?: string;
    author?: string;
    year?: string;
  }[];
  link?: {
    URL: string;
    'content-type': string;
    'intended-application': string;
  }[];
  URL?: string;
  subject?: string[];
}

export class CrossRefClient extends BaseApiClient {
  private email: string;

  constructor(email: string = 'your-email@example.com') {
    super(
      'https://api.crossref.org',
      { requestsPerSecond: config.rateLimits.crossRef },
      {
        'User-Agent': `ScopusAICrawler/1.0 (mailto:${email})`,
      }
    );
    this.email = email;
  }

  async search(query: string, options: {
    offset?: number;
    rows?: number;
    sort?: 'score' | 'relevance' | 'updated' | 'deposited' | 'indexed' | 'published' | 'published-print' | 'published-online' | 'issued' | 'is-referenced-by-count' | 'references-count';
    order?: 'asc' | 'desc';
    filter?: string;
  } = {}): Promise<{ papers: Paper[]; totalResults: number }> {
    const { offset = 0, rows = 25, sort = 'is-referenced-by-count', order = 'desc', filter } = options;

    const params: Record<string, unknown> = {
      query,
      offset,
      rows,
      sort,
      order,
      mailto: this.email,
    };

    if (filter) {
      params.filter = filter;
    }

    const result = await this.request<CrossRefSearchResult>({
      method: 'GET',
      url: '/works',
      params,
    });

    const papers = result.message.items.map((work) => this.mapToPaper(work));

    return {
      papers,
      totalResults: result.message['total-results'],
    };
  }

  async searchByKeywords(keywords: string[], options: {
    fromDate?: string;
    toDate?: string;
    minCitations?: number;
    rows?: number;
  } = {}): Promise<{ papers: Paper[]; totalResults: number }> {
    const { fromDate, toDate, minCitations, rows = 50 } = options;

    // Build filter string
    const filters: string[] = [];

    if (fromDate) {
      filters.push(`from-pub-date:${fromDate}`);
    }
    if (toDate) {
      filters.push(`until-pub-date:${toDate}`);
    }
    if (minCitations) {
      filters.push(`has-references:true`);
    }

    return this.search(keywords.join(' '), {
      rows,
      filter: filters.length > 0 ? filters.join(',') : undefined,
    });
  }

  async getWorkByDOI(doi: string): Promise<Paper | null> {
    try {
      interface SingleWorkResult {
        message: CrossRefWork;
      }

      const result = await this.request<SingleWorkResult>({
        method: 'GET',
        url: `/works/${encodeURIComponent(doi)}`,
        params: { mailto: this.email },
      });

      return this.mapToPaper(result.message);
    } catch (error) {
      console.error(`Failed to get work by DOI ${doi}:`, error);
      return null;
    }
  }

  async getReferences(doi: string): Promise<string[]> {
    try {
      const paper = await this.getWorkByDOI(doi);
      return paper?.references || [];
    } catch (error) {
      console.error(`Failed to get references for DOI ${doi}:`, error);
      return [];
    }
  }

  private mapToPaper(work: CrossRefWork): Paper {
    const authors: Author[] = (work.author || []).map((a) => ({
      name: a.name || `${a.given || ''} ${a.family || ''}`.trim() || 'Unknown',
      affiliation: a.affiliation?.[0]?.name,
      orcid: a.ORCID,
    }));

    // Extract publication date
    let publicationDate: string | undefined;
    if (work.issued?.['date-parts']?.[0]) {
      const [year, month = 1, day = 1] = work.issued['date-parts'][0];
      publicationDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Extract references DOIs
    const references = (work.reference || [])
      .map((ref) => ref.DOI)
      .filter((doi): doi is string => !!doi);

    // Find PDF URL
    const pdfLink = work.link?.find((l) =>
      l['content-type'] === 'application/pdf' ||
      l['intended-application'] === 'text-mining'
    );

    return {
      id: uuidv4(),
      doi: work.DOI,
      title: work.title?.[0] || 'Untitled',
      authors,
      abstract: work.abstract,
      keywords: work.subject || [],
      publicationDate,
      journal: work['container-title']?.[0],
      publisher: work.publisher,
      volume: work.volume,
      issue: work.issue,
      pages: work.page,
      citationCount: work['is-referenced-by-count'] || 0,
      referenceCount: work['references-count'] || 0,
      pdfUrl: pdfLink?.URL,
      publisherUrl: work.URL,
      references,
      source: 'crossref',
      discoveredAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }
}
