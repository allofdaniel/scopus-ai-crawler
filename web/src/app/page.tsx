"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Sparkles,
  Search,
  Plus,
  X,
  Loader2,
  ExternalLink,
  Quote,
  Calendar,
  Download,
  RefreshCw,
  FileText,
  TrendingUp,
  GitBranch,
  Brain,
} from "lucide-react";

interface Analysis {
  readingDecision: 'must_read' | 'should_read' | 'maybe_read' | 'skip';
  readingReason: string;
  relevanceScore: number;
  abstractSummary: string;
  keyFindings: string[];
}

interface Paper {
  id: string;
  doi?: string;
  title: string;
  authors: { name: string }[];
  abstract?: string;
  keywords: string[];
  publicationDate?: string;
  journal?: string;
  citationCount: number;
  source: string;
  openAccessUrl?: string;
  analysis?: Analysis;
  depth: number;
}

interface CrawlResult {
  papers: Paper[];
  summary?: string;
  stats: {
    total: number;
    byDecision: Record<string, number>;
    byDepth: { initial: number; fromReferences: number };
  };
}

interface CrawlStatus {
  isRunning: boolean;
  progress: number;
  totalPapers: number;
  processedPapers: number;
  papers: Paper[];
  summary?: string;
  error?: string;
}

// Utils
function formatDate(date?: string): string {
  if (!date) return '날짜 미상';
  try {
    return new Date(date).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return date;
  }
}

function getDecisionLabel(decision?: string): string {
  const labels: Record<string, string> = {
    must_read: '필독',
    should_read: '권장',
    maybe_read: '선택',
    skip: '건너뛰기',
  };
  return labels[decision || ''] || '미분석';
}

function getDecisionColor(decision?: string): string {
  const colors: Record<string, string> = {
    must_read: 'bg-red-500 text-white',
    should_read: 'bg-orange-500 text-white',
    maybe_read: 'bg-yellow-500 text-black',
    skip: 'bg-gray-400 text-white',
  };
  return colors[decision || ''] || 'bg-gray-200';
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export default function Home() {
  const [keywords, setKeywords] = useState<string[]>([""]);
  const [context, setContext] = useState("");
  const [maxDepth, setMaxDepth] = useState(1);
  const [results, setResults] = useState<CrawlResult | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const crawlMutation = useMutation({
    mutationFn: async (params: { keywords: string[]; context?: string; maxDepth: number }) => {
      const response = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          papersPerSource: 15,
        }),
      });
      if (!response.ok) throw new Error('Crawl failed');
      return response.json() as Promise<CrawlResult>;
    },
    onSuccess: (data) => {
      setResults(data);
    },
  });

  // Poll for status during crawl
  const { data: status } = useQuery<CrawlStatus>({
    queryKey: ['crawlStatus'],
    queryFn: async () => {
      const response = await fetch('/api/crawl');
      return response.json();
    },
    refetchInterval: crawlMutation.isPending ? 2000 : false,
  });

  const addKeyword = () => setKeywords([...keywords, ""]);
  const removeKeyword = (index: number) => {
    if (keywords.length > 1) {
      setKeywords(keywords.filter((_, i) => i !== index));
    }
  };
  const updateKeyword = (index: number, value: string) => {
    const newKeywords = [...keywords];
    newKeywords[index] = value;
    setKeywords(newKeywords);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validKeywords = keywords.filter((k) => k.trim() !== "");
    if (validKeywords.length === 0) return;
    crawlMutation.mutate({
      keywords: validKeywords,
      context: context || undefined,
      maxDepth,
    });
  };

  const filteredPapers = results?.papers.filter((paper) => {
    if (!filter) return true;
    if (filter === 'unanalyzed') return !paper.analysis;
    return paper.analysis?.readingDecision === filter;
  });

  const decisions = ["must_read", "should_read", "maybe_read", "skip"];

  // Export to JSON
  const exportResults = () => {
    if (!results) return;
    const data = JSON.stringify(results, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-results-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Scopus AI Crawler</h1>
          <Sparkles className="w-6 h-6 text-yellow-500" />
        </div>
        <p className="text-muted-foreground">
          AI 기반 학술 논문 자동 탐색, 참조 추적 및 분석 시스템
        </p>
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            논문 크롤링
          </CardTitle>
          <CardDescription>
            키워드로 검색하고 AI가 논문을 분석하며 참조 논문까지 추적합니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">검색 키워드</label>
              {keywords.map((keyword, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder={`키워드 ${index + 1} (예: machine learning)`}
                    value={keyword}
                    onChange={(e) => updateKeyword(index, e.target.value)}
                  />
                  {keywords.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeKeyword(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addKeyword}
              >
                <Plus className="w-4 h-4 mr-1" />
                키워드 추가
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">연구 맥락 (선택)</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="예: 항공 안전 시스템에서 머신러닝 적용에 관한 연구를 진행 중입니다."
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">참조 추적 깊이:</label>
                <select
                  className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                >
                  <option value={0}>추적 안함</option>
                  <option value={1}>1단계</option>
                  <option value={2}>2단계</option>
                </select>
              </div>
              <div className="text-xs text-muted-foreground">
                <GitBranch className="w-3 h-3 inline mr-1" />
                높을수록 더 많은 관련 논문 발견
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={crawlMutation.isPending}
            >
              {crawlMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  크롤링 중... {status?.progress || 0}%
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  논문 크롤링 시작
                </>
              )}
            </Button>

            {crawlMutation.isPending && status && (
              <div className="space-y-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${status.progress}%` }}
                  />
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  {status.processedPapers}/{status.totalPapers} 논문 처리 중...
                </p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {results && (
        <>
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{results.stats.total}</p>
                    <p className="text-xs text-muted-foreground">총 논문</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold">{results.stats.byDecision.must_read || 0}</p>
                    <p className="text-xs text-muted-foreground">필독 논문</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{results.stats.byDepth.fromReferences}</p>
                    <p className="text-xs text-muted-foreground">참조에서 발견</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {results.stats.total - (results.stats.byDecision.unanalyzed || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">AI 분석됨</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* AI Summary */}
          {results.summary && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Brain className="w-5 h-5" />
                    AI 연구 요약
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSummary(!showSummary)}
                  >
                    {showSummary ? '접기' : '펼치기'}
                  </Button>
                </div>
              </CardHeader>
              {showSummary && (
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    {results.summary.split('\n').map((paragraph, i) => (
                      <p key={i} className="mb-2 text-sm text-muted-foreground">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Filters & Export */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Button
                variant={filter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(null)}
              >
                전체 ({results.stats.total})
              </Button>
              {decisions.map((d) => (
                <Button
                  key={d}
                  variant={filter === d ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(d)}
                  className={filter === d ? getDecisionColor(d) : ""}
                >
                  {getDecisionLabel(d)} ({results.stats.byDecision[d] || 0})
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={exportResults}
            >
              <Download className="w-4 h-4 mr-1" />
              JSON 내보내기
            </Button>
          </div>

          {/* Paper Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPapers?.map((paper) => (
              <PaperCard key={paper.id} paper={paper} />
            ))}
          </div>

          {filteredPapers?.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                해당 조건에 맞는 논문이 없습니다.
              </CardContent>
            </Card>
          )}
        </>
      )}

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>Semantic Scholar, OpenAlex, CrossRef API를 활용합니다.</p>
        <p className="mt-1">Gemini AI가 논문을 분석하여 읽기 우선순위를 제안합니다.</p>
      </footer>
    </div>
  );
}

function PaperCard({ paper }: { paper: Paper }) {
  return (
    <Card className={`hover:shadow-md transition-shadow ${paper.depth > 0 ? 'border-l-4 border-l-green-400' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">
            {truncateText(paper.title, 80)}
          </CardTitle>
          <div className="flex gap-1 shrink-0">
            {paper.depth > 0 && (
              <Badge variant="outline" className="text-xs">
                <GitBranch className="w-3 h-3 mr-1" />
                참조
              </Badge>
            )}
            {paper.analysis && (
              <Badge className={getDecisionColor(paper.analysis.readingDecision)}>
                {getDecisionLabel(paper.analysis.readingDecision)}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {paper.authors.slice(0, 2).map((a) => a.name).join(", ")}
          {paper.authors.length > 2 && ` 외 ${paper.authors.length - 2}명`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {paper.analysis?.abstractSummary && (
          <p className="text-sm text-muted-foreground">
            {truncateText(paper.analysis.abstractSummary, 120)}
          </p>
        )}

        {paper.analysis?.readingReason && (
          <p className="text-xs italic text-muted-foreground border-l-2 pl-2">
            "{truncateText(paper.analysis.readingReason, 80)}"
          </p>
        )}

        {paper.analysis?.keyFindings && paper.analysis.keyFindings.length > 0 && (
          <div className="text-xs">
            <span className="font-medium">주요 발견:</span>
            <ul className="list-disc list-inside text-muted-foreground">
              {paper.analysis.keyFindings.slice(0, 2).map((f, i) => (
                <li key={i}>{truncateText(f, 40)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {paper.journal && (
            <span className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {truncateText(paper.journal, 20)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(paper.publicationDate)}
          </span>
          <span className="flex items-center gap-1">
            <Quote className="w-3 h-3" />
            {paper.citationCount.toLocaleString()}
          </span>
          {paper.analysis && (
            <span className="ml-auto font-medium text-primary">
              {(paper.analysis.relevanceScore * 100).toFixed(0)}%
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          {paper.openAccessUrl && (
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <a href={paper.openAccessUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3 mr-1" />
                PDF
              </a>
            </Button>
          )}
          {paper.doi && (
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer">
                DOI
              </a>
            </Button>
          )}
          <Badge variant="outline" className="text-xs">
            {paper.source === 'semantic_scholar' ? 'S2' : paper.source === 'openalex' ? 'OA' : 'CR'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
