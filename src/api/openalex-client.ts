import { BaseApiClient } from './base-client.js';
import { config } from '../config/index.js';
import { Paper, Author } from '../types/paper.js';
import { v4 as uuidv4 } from 'uuid';

interface OpenAlexSearchResult {
  meta: {
    count: number;
    db_response_time_ms: number;
    page: number;
    per_page: number;
  };
  results: OpenAlexWork[];
}

interface OpenAlexWork {
  id: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  publication_date?: string;
  primary_location?: {
    source?: {
      display_name?: string;
      issn_l?: string;
      type?: string;
    };
    pdf_url?: string;
    landing_page_url?: string;
    is_oa?: boolean;
  };
  type?: string;
  open_access?: {
    is_oa?: boolean;
    oa_status?: string;
    oa_url?: string;
  };
  authorships?: {
    author: {
      id?: string;
      display_name?: string;
      orcid?: string;
    };
    institutions?: {
      display_name?: string;
    }[];
  }[];
  cited_by_count?: number;
  cited_by_api_url?: string;
  counts_by_year?: {
    year: number;
    cited_by_count: number;
  }[];
  biblio?: {
    volume?: string;
    issue?: string;
    first_page?: string;
    last_page?: string;
  };
  concepts?: {
    id: string;
    display_name: string;
    level: number;
    score: number;
  }[];
  keywords?: {
    keyword: string;
    score: number;
  }[];
  abstract_inverted_index?: Record<string, number[]>;
  referenced_works?: string[];
  related_works?: string[];
}

export class OpenAlexClient extends BaseApiClient {
  private email: string;

  constructor(email: string = 'your-email@example.com') {
    super(
      'https://api.openalex.org',
      { requestsPerSecond: config.rateLimits.openAlex },
      {
        'User-Agent': `ScopusAICrawler/1.0 (mailto:${email})`,
      }
    );
    this.email = email;
  }

  async search(query: string, options: {
    page?: number;
    perPage?: number;
    sortBy?: 'cited_by_count' | 'publication_date' | 'relevance_score';
    filter?: string;
  } = {}): Promise<{ papers: Paper[]; totalResults: number }> {
    const { page = 1, perPage = 25, sortBy = 'cited_by_count', filter } = options;

    const params: Record<string, unknown> = {
      search: query,
      page,
      per_page: perPage,
      sort: sortBy + ':desc',
      mailto: this.email,
    };

    if (filter) {
      params.filter = filter;
    }

    const result = await this.request<OpenAlexSearchResult>({
      method: 'GET',
      url: '/works',
      params,
    });

    const papers = result.results.map((work) => this.mapToPaper(work));

    return {
      papers,
      totalResults: result.meta.count,
    };
  }

  async searchByKeywords(keywords: string[], options: {
    fromDate?: string;
    toDate?: string;
    minCitations?: number;
    conceptIds?: string[];
    perPage?: number;
  } = {}): Promise<{ papers: Paper[]; totalResults: number }> {
    const { fromDate, toDate, minCitations, conceptIds, perPage = 50 } = options;

    // Build filter string
    const filters: string[] = [];

    if (fromDate) {
      filters.push(`from_publication_date:${fromDate}`);
    }
    if (toDate) {
      filters.push(`to_publication_date:${toDate}`);
    }
    if (minCitations) {
      filters.push(`cited_by_count:>${minCitations}`);
    }
    if (conceptIds?.length) {
      filters.push(`concepts.id:${conceptIds.join('|')}`);
    }

    return this.search(keywords.join(' '), {
      perPage,
      filter: filters.length > 0 ? filters.join(',') : undefined,
    });
  }

  async getWork(workId: string): Promise<Paper | null> {
    try {
      // OpenAlex IDs can be URLs or short IDs
      const id = workId.replace('https://openalex.org/', '');

      const result = await this.request<OpenAlexWork>({
        method: 'GET',
        url: `/works/${id}`,
        params: { mailto: this.email },
      });

      return this.mapToPaper(result);
    } catch (error) {
      console.error(`Failed to get work ${workId}:`, error);
      return null;
    }
  }

  async getWorkByDOI(doi: string): Promise<Paper | null> {
    try {
      const result = await this.request<OpenAlexWork>({
        method: 'GET',
        url: `/works/doi:${doi}`,
        params: { mailto: this.email },
      });

      return this.mapToPaper(result);
    } catch (error) {
      console.error(`Failed to get work by DOI ${doi}:`, error);
      return null;
    }
  }

  async getReferences(workId: string): Promise<Paper[]> {
    try {
      const id = workId.replace('https://openalex.org/', '');

      const result = await this.request<OpenAlexSearchResult>({
        method: 'GET',
        url: '/works',
        params: {
          filter: `cites:${id}`,
          per_page: 50,
          mailto: this.email,
        },
      });

      return result.results.map((work) => this.mapToPaper(work));
    } catch (error) {
      console.error(`Failed to get references for ${workId}:`, error);
      return [];
    }
  }

  async getConcepts(query: string): Promise<{ id: string; name: string; level: number }[]> {
    interface ConceptResult {
      results: { id: string; display_name: string; level: number }[];
    }

    const result = await this.request<ConceptResult>({
      method: 'GET',
      url: '/concepts',
      params: {
        search: query,
        per_page: 10,
        mailto: this.email,
      },
    });

    return result.results.map((c) => ({
      id: c.id,
      name: c.display_name,
      level: c.level,
    }));
  }

  private mapToPaper(work: OpenAlexWork): Paper {
    const authors: Author[] = (work.authorships || []).map((a) => ({
      name: a.author.display_name || 'Unknown',
      affiliation: a.institutions?.[0]?.display_name,
      orcid: a.author.orcid,
    }));

    // Extract keywords from concepts
    const keywords = [
      ...(work.concepts || [])
        .filter((c) => c.score > 0.3)
        .map((c) => c.display_name),
      ...(work.keywords || []).map((k) => k.keyword),
    ];

    // Reconstruct abstract from inverted index
    let abstract: string | undefined;
    if (work.abstract_inverted_index) {
      const words: [string, number][] = [];
      for (const [word, positions] of Object.entries(work.abstract_inverted_index)) {
        for (const pos of positions) {
          words.push([word, pos]);
        }
      }
      words.sort((a, b) => a[1] - b[1]);
      abstract = words.map((w) => w[0]).join(' ');
    }

    const pages = work.biblio?.first_page && work.biblio?.last_page
      ? `${work.biblio.first_page}-${work.biblio.last_page}`
      : work.biblio?.first_page;

    // Extract DOIs from referenced works
    const references = (work.referenced_works || [])
      .map((ref) => {
        // OpenAlex work IDs are URLs like https://openalex.org/W1234
        return ref.replace('https://openalex.org/', '');
      });

    return {
      id: uuidv4(),
      doi: work.doi?.replace('https://doi.org/', ''),
      openAlexId: work.id.replace('https://openalex.org/', ''),
      title: work.display_name || work.title || 'Untitled',
      authors,
      abstract,
      keywords: [...new Set(keywords)],
      publicationDate: work.publication_date,
      journal: work.primary_location?.source?.display_name,
      volume: work.biblio?.volume,
      issue: work.biblio?.issue,
      pages,
      citationCount: work.cited_by_count || 0,
      referenceCount: work.referenced_works?.length || 0,
      openAccessUrl: work.open_access?.oa_url || work.primary_location?.pdf_url,
      publisherUrl: work.primary_location?.landing_page_url,
      references,
      source: 'openalex',
      discoveredAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }
}
