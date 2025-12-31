import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config/index.js';
import { Paper, AIAnalysis } from '../types/paper.js';

interface AnalysisResult {
  readingDecision: 'must_read' | 'should_read' | 'maybe_read' | 'skip';
  readingReason: string;
  confidenceScore: number;
  abstractSummary: string;
  keyFindings: string[];
  methodology?: string;
  limitations?: string[];
  relevanceScore: number;
  relevanceTopics: string[];
  suggestedActions: ('read_full' | 'check_figures' | 'follow_references' | 'cite' | 'archive')[];
  importantReferences: string[];
}

export class GeminiAnalyzer {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private researchContext: string;

  constructor(researchContext: string = '') {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4096,
      },
    });
    this.researchContext = researchContext;
  }

  setResearchContext(context: string): void {
    this.researchContext = context;
  }

  async analyzePaper(paper: Paper): Promise<AIAnalysis> {
    const prompt = this.buildAnalysisPrompt(paper);

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();
      const analysis = this.parseAnalysisResponse(response, paper.id);
      return analysis;
    } catch (error) {
      console.error(`Failed to analyze paper ${paper.id}:`, error);
      return this.createDefaultAnalysis(paper.id);
    }
  }

  async batchAnalyzePapers(papers: Paper[], batchSize: number = 5): Promise<AIAnalysis[]> {
    const analyses: AIAnalysis[] = [];

    for (let i = 0; i < papers.length; i += batchSize) {
      const batch = papers.slice(i, i + batchSize);
      const batchPromises = batch.map((paper) => this.analyzePaper(paper));
      const batchResults = await Promise.all(batchPromises);
      analyses.push(...batchResults);

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < papers.length) {
        await this.delay(2000);
      }
    }

    return analyses;
  }

  async quickScreen(paper: Paper): Promise<{ shouldAnalyze: boolean; reason: string }> {
    const prompt = `
You are a research assistant helping to quickly screen academic papers for relevance.

Research Context: ${this.researchContext || 'General academic research'}

Paper Information:
- Title: ${paper.title}
- Authors: ${paper.authors.map((a) => a.name).join(', ')}
- Journal: ${paper.journal || 'Unknown'}
- Publication Date: ${paper.publicationDate || 'Unknown'}
- Citation Count: ${paper.citationCount}
- Keywords: ${paper.keywords.join(', ') || 'None'}
${paper.abstract ? `- Abstract Preview: ${paper.abstract.slice(0, 500)}...` : ''}

Task: Quickly determine if this paper warrants full AI analysis based on:
1. Title relevance to research context
2. Citation count (higher is generally better)
3. Publication recency
4. Journal quality (if recognizable)

Respond in JSON format:
{
  "shouldAnalyze": true/false,
  "reason": "Brief explanation of decision"
}
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error(`Quick screen failed for paper ${paper.id}:`, error);
    }

    // Default to analyzing if screening fails
    return { shouldAnalyze: true, reason: 'Screening failed, defaulting to analyze' };
  }

  private buildAnalysisPrompt(paper: Paper): string {
    return `
You are an expert research analyst helping researchers efficiently evaluate academic papers.

## Research Context
${this.researchContext || 'Evaluate this paper for general academic research relevance.'}

## Paper Information
- **Title**: ${paper.title}
- **Authors**: ${paper.authors.map((a) => `${a.name}${a.affiliation ? ` (${a.affiliation})` : ''}`).join('; ')}
- **Journal/Venue**: ${paper.journal || 'Unknown'}
- **Publication Date**: ${paper.publicationDate || 'Unknown'}
- **Citation Count**: ${paper.citationCount}
- **Influential Citations**: ${paper.influentialCitationCount || 'N/A'}
- **Keywords**: ${paper.keywords.join(', ') || 'None provided'}

## Abstract
${paper.abstract || 'No abstract available. Please base analysis on title and metadata only.'}

## Analysis Task
Analyze this paper and provide a structured evaluation. Consider:
1. **Relevance** to the research context
2. **Quality indicators** (journal reputation, citation count, methodology hints)
3. **Novelty** of findings based on abstract
4. **Practical value** for the researcher

## Required Output Format (JSON)
{
  "readingDecision": "must_read" | "should_read" | "maybe_read" | "skip",
  "readingReason": "2-3 sentence explanation of the reading recommendation",
  "confidenceScore": 0.0-1.0,
  "abstractSummary": "2-3 sentence summary of the paper's main contribution",
  "keyFindings": ["finding1", "finding2", ...],
  "methodology": "Brief description of methodology if identifiable from abstract",
  "limitations": ["limitation1", ...] or null if not identifiable,
  "relevanceScore": 0.0-1.0,
  "relevanceTopics": ["topic1", "topic2", ...],
  "suggestedActions": ["read_full" | "check_figures" | "follow_references" | "cite" | "archive"],
  "importantReferences": ["DOI or description of papers to follow up on"]
}

## Decision Guidelines
- **must_read**: Highly relevant, potentially foundational paper. High citations or novel approach.
- **should_read**: Relevant to research, worth reading but not critical.
- **maybe_read**: Tangentially related, might be useful for background.
- **skip**: Not relevant to research context or low quality indicators.

Respond ONLY with the JSON object, no additional text.
`;
  }

  private parseAnalysisResponse(response: string, paperId: string): AIAnalysis {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed: AnalysisResult = JSON.parse(jsonMatch[0]);

      return {
        paperId,
        readingDecision: parsed.readingDecision,
        readingReason: parsed.readingReason,
        confidenceScore: Math.min(1, Math.max(0, parsed.confidenceScore)),
        abstractSummary: parsed.abstractSummary,
        keyFindings: parsed.keyFindings || [],
        methodology: parsed.methodology,
        limitations: parsed.limitations,
        relevanceScore: Math.min(1, Math.max(0, parsed.relevanceScore)),
        relevanceTopics: parsed.relevanceTopics || [],
        suggestedActions: parsed.suggestedActions || [],
        importantReferences: parsed.importantReferences || [],
        analysisVersion: '1.0.0',
        analyzedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Failed to parse analysis response for ${paperId}:`, error);
      return this.createDefaultAnalysis(paperId);
    }
  }

  private createDefaultAnalysis(paperId: string): AIAnalysis {
    return {
      paperId,
      readingDecision: 'maybe_read',
      readingReason: 'Analysis could not be completed. Manual review recommended.',
      confidenceScore: 0,
      abstractSummary: 'Analysis unavailable',
      keyFindings: [],
      relevanceScore: 0.5,
      relevanceTopics: [],
      suggestedActions: ['read_full'],
      importantReferences: [],
      analysisVersion: '1.0.0',
      analyzedAt: new Date().toISOString(),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async summarizeCollection(papers: Paper[], analyses: AIAnalysis[]): Promise<string> {
    const mustRead = analyses.filter((a) => a.readingDecision === 'must_read');
    const shouldRead = analyses.filter((a) => a.readingDecision === 'should_read');

    const topPapers = [...mustRead, ...shouldRead].slice(0, 10);
    const paperSummaries = topPapers.map((analysis) => {
      const paper = papers.find((p) => p.id === analysis.paperId);
      return `- "${paper?.title}": ${analysis.abstractSummary}`;
    }).join('\n');

    const prompt = `
Based on the following top-rated papers from a literature search, provide a synthesis of the key themes and findings:

## Top Papers:
${paperSummaries}

## Statistics:
- Total papers analyzed: ${analyses.length}
- Must-read papers: ${mustRead.length}
- Should-read papers: ${shouldRead.length}

Please provide:
1. A 2-3 paragraph synthesis of the main research themes
2. Key gaps or opportunities identified
3. Recommended reading order for the must-read papers

Format the response in clear, readable paragraphs.
`;

    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Failed to summarize collection:', error);
      return 'Summary generation failed.';
    }
  }
}
