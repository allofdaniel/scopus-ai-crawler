import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const configSchema = z.object({
  // API Keys
  scopusApiKey: z.string().min(1, 'SCOPUS_API_KEY is required'),
  semanticScholarApiKey: z.string().optional(),
  geminiApiKey: z.string().min(1, 'GEMINI_API_KEY is required'),

  // Server
  port: z.number().default(3001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  databasePath: z.string().default('./data/papers.db'),

  // Crawling
  crawlIntervalHours: z.number().default(24),
  maxPapersPerSearch: z.number().default(100),
  maxReferenceDepth: z.number().default(2),

  // Rate Limiting (requests per second)
  rateLimits: z.object({
    scopus: z.number().default(2),
    semanticScholar: z.number().default(10),
    openAlex: z.number().default(10),
    crossRef: z.number().default(50),
  }),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse({
  scopusApiKey: process.env.SCOPUS_API_KEY,
  semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV,
  databasePath: process.env.DATABASE_PATH,
  crawlIntervalHours: parseInt(process.env.CRAWL_INTERVAL_HOURS || '24', 10),
  maxPapersPerSearch: parseInt(process.env.MAX_PAPERS_PER_SEARCH || '100', 10),
  maxReferenceDepth: parseInt(process.env.MAX_REFERENCE_DEPTH || '2', 10),
  rateLimits: {
    scopus: parseInt(process.env.SCOPUS_RATE_LIMIT || '2', 10),
    semanticScholar: parseInt(process.env.SEMANTIC_SCHOLAR_RATE_LIMIT || '10', 10),
    openAlex: parseInt(process.env.OPENALEX_RATE_LIMIT || '10', 10),
    crossRef: parseInt(process.env.CROSSREF_RATE_LIMIT || '50', 10),
  },
});
