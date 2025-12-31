import { BaseApiClient } from './base-client.js';
import { config } from '../config/index.js';
import { Paper, Author } from '../types/paper.js';
import { v4 as uuidv4 } from 'uuid';

interface ScopusSearchResult {
  'search-results': {
    'opensearch:totalResults': string;
    'opensearch:startIndex': string;
    'opensearch:itemsPerPage': string;
    entry?: ScopusEntry[];
  };
}

interface ScopusEntry {
  'dc:identifier'?: string;
  'prism:doi'?: string;
  'dc:title'?: string;
  'dc:creator'?: string;
  'prism:publicationName'?: string;
  'prism:coverDate'?: string;
  'prism:volume'?: string;
  'prism:issueIdentifier'?: string;
  'prism:pageRange'?: string;
  'citedby-count'?: string;
  'prism:aggregationType'?: string;
  'subtypeDescription'?: string;
  'authkeywords'?: string;
  'affiliation'?: { affilname?: string }[];
  author?: { authname?: string; 'author-url'?: string }[];
  link?: { '@ref': string; '@href': string }[];
}

interface ScopusAbstractResult {
  'abstracts-retrieval-response': {
    coredata?: {
      'dc:description'?: string;
      'prism:doi'?: string;
      'dc:title'?: string;
    };
    'item'?: {
      'bibrecord'?: {
        'head'?: {
          'abstracts'?: string;
          'source'?: {
            'additional-srcinfo'?: {
              'conferenceinfo'?: unknown;
            };
          };
        };
        'tail'?: {
          'bibliography'?: {
            'reference'?: ScopusReference[];
          };
        };
      };
    };
  };
}

interface ScopusReference {
  'ref-info'?: {
    'refd-itemidlist'?: {
      'itemid'?: { '#text'?: string; '@idtype'?: string }[];
    };
    'ref-title'?: {
      'ref-titletext'?: string;
    };
    'ref-authors'?: {
      'author'?: { 'ce:indexed-name'?: string }[];
    };
  };
}

export class ScopusClient extends BaseApiClient {
  constructor() {
    super(
      'https://api.elsevier.com/content',
      { requestsPerSecond: config.rateLimits.scopus },
      {
        'X-ELS-APIKey': config.scopusApiKey,
        'Accept': 'application/json',
      }
    );
  }

  async search(query: string, options: {
    start?: number;
    count?: number;
    sortBy?: 'relevancy' | 'citedby-count' | 'date';
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<{ papers: Paper[]; totalResults: number }> {
    const { start = 0, count = 25, sortBy = 'relevancy', dateFrom, dateTo } = options;

    let searchQuery = query;
    if (dateFrom && dateTo) {
      searchQuery += ` AND PUBYEAR > ${dateFrom.slice(0, 4)} AND PUBYEAR < ${dateTo.slice(0, 4)}`;
    }

    const result = await this.request<ScopusSearchResult>({
      method: 'GET',
      url: '/search/scopus',
      params: {
        query: searchQuery,
        start,
        count,
        sort: sortBy,
        view: 'COMPLETE',
      },
    });

    const entries = result['search-results'].entry || [];
    const papers = entries.map((entry) => this.mapToPaper(entry));

    return {
      papers,
      totalResults: parseInt(result['search-results']['opensearch:totalResults'], 10),
    };
  }

  async getAbstract(scopusId: string): Promise<{ abstract: string; references: string[] }> {
    try {
      const result = await this.request<ScopusAbstractResult>({
        method: 'GET',
        url: `/abstract/scopus_id/${scopusId}`,
        params: {
          view: 'FULL',
        },
      });

      const coredata = result['abstracts-retrieval-response'].coredata;
      const abstract = coredata?.['dc:description'] || '';

      // Extract references (DOIs)
      const bibliography = result['abstracts-retrieval-response']?.item?.bibrecord?.tail?.bibliography;
      const refs = bibliography?.reference || [];
      const references: string[] = [];

      for (const ref of refs) {
        const itemIds = ref['ref-info']?.['refd-itemidlist']?.['itemid'];
        if (itemIds) {
          const doiItem = itemIds.find((item) => item['@idtype'] === 'DOI');
          if (doiItem?.['#text']) {
            references.push(doiItem['#text']);
          }
        }
      }

      return { abstract, references };
    } catch (error) {
      console.error(`Failed to get abstract for ${scopusId}:`, error);
      return { abstract: '', references: [] };
    }
  }

  async searchByKeywords(keywords: string[], options: {
    field?: string;
    count?: number;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<{ papers: Paper[]; totalResults: number }> {
    // Build Scopus query with keywords
    let query = keywords.map((kw) => `TITLE-ABS-KEY("${kw}")`).join(' AND ');

    if (options.field) {
      query += ` AND SUBJAREA(${options.field})`;
    }

    return this.search(query, {
      count: options.count || 25,
      sortBy: 'citedby-count',
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
    });
  }

  private mapToPaper(entry: ScopusEntry): Paper {
    const scopusId = entry['dc:identifier']?.replace('SCOPUS_ID:', '') || '';

    const authors: Author[] = (entry.author || []).map((a) => ({
      name: a.authname || 'Unknown',
      affiliation: entry.affiliation?.[0]?.affilname,
    }));

    if (authors.length === 0 && entry['dc:creator']) {
      authors.push({ name: entry['dc:creator'] });
    }

    const keywords = entry.authkeywords
      ? entry.authkeywords.split(' | ').map((k) => k.trim())
      : [];

    // Find PDF and publisher URLs
    let pdfUrl: string | undefined;
    let publisherUrl: string | undefined;

    for (const link of entry.link || []) {
      if (link['@ref'] === 'full-text') {
        pdfUrl = link['@href'];
      }
      if (link['@ref'] === 'scopus') {
        publisherUrl = link['@href'];
      }
    }

    return {
      id: uuidv4(),
      doi: entry['prism:doi'],
      scopusId,
      title: entry['dc:title'] || 'Untitled',
      authors,
      keywords,
      publicationDate: entry['prism:coverDate'],
      journal: entry['prism:publicationName'],
      volume: entry['prism:volume'],
      issue: entry['prism:issueIdentifier'],
      pages: entry['prism:pageRange'],
      citationCount: parseInt(entry['citedby-count'] || '0', 10),
      referenceCount: 0,
      pdfUrl,
      publisherUrl,
      references: [],
      source: 'scopus',
      discoveredAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }
}
