import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { config } from '../config/index.js';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { Paper, AIAnalysis, SearchQuery, CrawlSession } from '../types/paper.js';

interface Database {
  papers: Paper[];
  analyses: AIAnalysis[];
  queries: SearchQuery[];
  sessions: CrawlSession[];
  paperQueries: { paperId: string; queryId: string; depth: number }[];
}

const defaultData: Database = {
  papers: [],
  analyses: [],
  queries: [],
  sessions: [],
  paperQueries: [],
};

let db: Low<Database> | null = null;

export async function getDatabase(): Promise<Low<Database>> {
  if (db) return db;

  const dbPath = config.databasePath.replace('.db', '.json');
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const adapter = new JSONFile<Database>(dbPath);
  db = new Low(adapter, defaultData);

  await db.read();

  // Initialize with default data if empty
  if (!db.data) {
    db.data = defaultData;
    await db.write();
  }

  return db;
}

export async function initializeDatabase(): Promise<void> {
  await getDatabase();
  console.log('Database initialized successfully');
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.write();
    db = null;
  }
}

// Helper functions for database operations
export async function findPaperByDOI(doi: string): Promise<Paper | undefined> {
  const database = await getDatabase();
  return database.data.papers.find((p) => p.doi === doi);
}

export async function findPaperByTitle(title: string): Promise<Paper | undefined> {
  const database = await getDatabase();
  return database.data.papers.find((p) => p.title === title);
}

export async function findPaperById(id: string): Promise<Paper | undefined> {
  const database = await getDatabase();
  return database.data.papers.find((p) => p.id === id);
}

export async function savePaper(paper: Paper): Promise<void> {
  const database = await getDatabase();
  const existingIndex = database.data.papers.findIndex((p) => p.id === paper.id);

  if (existingIndex >= 0) {
    database.data.papers[existingIndex] = paper;
  } else {
    database.data.papers.push(paper);
  }

  await database.write();
}

export async function updatePaper(id: string, updates: Partial<Paper>): Promise<void> {
  const database = await getDatabase();
  const paper = database.data.papers.find((p) => p.id === id);

  if (paper) {
    Object.assign(paper, updates, { lastUpdated: new Date().toISOString() });
    await database.write();
  }
}

export async function saveAnalysis(analysis: AIAnalysis): Promise<void> {
  const database = await getDatabase();
  const existingIndex = database.data.analyses.findIndex((a) => a.paperId === analysis.paperId);

  if (existingIndex >= 0) {
    database.data.analyses[existingIndex] = analysis;
  } else {
    database.data.analyses.push(analysis);
  }

  await database.write();
}

export async function findAnalysisByPaperId(paperId: string): Promise<AIAnalysis | undefined> {
  const database = await getDatabase();
  return database.data.analyses.find((a) => a.paperId === paperId);
}

export async function saveQuery(query: SearchQuery): Promise<void> {
  const database = await getDatabase();
  const existingIndex = database.data.queries.findIndex((q) => q.id === query.id);

  if (existingIndex >= 0) {
    database.data.queries[existingIndex] = query;
  } else {
    database.data.queries.push(query);
  }

  await database.write();
}

export async function updateQuery(id: string, updates: Partial<SearchQuery>): Promise<void> {
  const database = await getDatabase();
  const query = database.data.queries.find((q) => q.id === id);

  if (query) {
    Object.assign(query, updates);
    await database.write();
  }
}

export async function findQueryById(id: string): Promise<SearchQuery | undefined> {
  const database = await getDatabase();
  return database.data.queries.find((q) => q.id === id);
}

export async function getAllQueries(): Promise<SearchQuery[]> {
  const database = await getDatabase();
  return [...database.data.queries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function saveSession(session: CrawlSession): Promise<void> {
  const database = await getDatabase();
  const existingIndex = database.data.sessions.findIndex((s) => s.id === session.id);

  if (existingIndex >= 0) {
    database.data.sessions[existingIndex] = session;
  } else {
    database.data.sessions.push(session);
  }

  await database.write();
}

export async function linkPaperToQuery(paperId: string, queryId: string, depth: number): Promise<void> {
  const database = await getDatabase();
  const exists = database.data.paperQueries.find(
    (pq) => pq.paperId === paperId && pq.queryId === queryId
  );

  if (!exists) {
    database.data.paperQueries.push({ paperId, queryId, depth });
    await database.write();
  }
}

export async function getPapersForQuery(queryId: string): Promise<Paper[]> {
  const database = await getDatabase();
  const paperIds = database.data.paperQueries
    .filter((pq) => pq.queryId === queryId)
    .map((pq) => pq.paperId);

  return database.data.papers.filter((p) => paperIds.includes(p.id));
}

export async function getStats(): Promise<{
  totalPapers: number;
  totalQueries: number;
  analyzedPapers: number;
  decisionBreakdown: Record<string, number>;
}> {
  const database = await getDatabase();

  const decisionBreakdown: Record<string, number> = {};
  for (const analysis of database.data.analyses) {
    const decision = analysis.readingDecision;
    decisionBreakdown[decision] = (decisionBreakdown[decision] || 0) + 1;
  }

  return {
    totalPapers: database.data.papers.length,
    totalQueries: database.data.queries.length,
    analyzedPapers: database.data.analyses.length,
    decisionBreakdown,
  };
}
