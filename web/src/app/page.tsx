"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { searchPapers, Paper, SearchResult } from "@/lib/api";
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
} from "lucide-react";
import { formatDate, getDecisionLabel, getDecisionColor, truncateText } from "@/lib/utils";

export default function Home() {
  const [keywords, setKeywords] = useState<string[]>([""]);
  const [context, setContext] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: searchPapers,
    onSuccess: (data) => {
      setResults(data);
    },
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

    mutation.mutate({
      keywords: validKeywords,
      context: context || undefined,
      limit: 30,
    });
  };

  const filteredPapers = results?.papers.filter((paper) => {
    if (!filter) return true;
    return paper.analysis?.readingDecision === filter;
  });

  const decisions = ["must_read", "should_read", "maybe_read", "skip"];

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Scopus AI Crawler</h1>
          <Sparkles className="w-6 h-6 text-yellow-500" />
        </div>
        <p className="text-muted-foreground">
          AI 기반 학술 논문 자동 탐색 및 분석 시스템
        </p>
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            논문 검색
          </CardTitle>
          <CardDescription>
            연구 분야의 키워드를 입력하고 AI가 논문을 분석합니다
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

            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  검색 및 AI 분석 중...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  논문 검색
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {results && (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="text-sm text-muted-foreground">
              총 {results.totalFound}개 발견, {results.uniqueCount}개 고유 논문
              <span className="ml-2 text-xs">
                (S2: {results.sources.semanticScholar}, OA: {results.sources.openAlex}, CR: {results.sources.crossRef})
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant={filter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(null)}
              >
                전체
              </Button>
              {decisions.map((d) => (
                <Button
                  key={d}
                  variant={filter === d ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(d)}
                  className={filter === d ? getDecisionColor(d) : ""}
                >
                  {getDecisionLabel(d)}
                </Button>
              ))}
            </div>
          </div>

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
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">
            {truncateText(paper.title, 100)}
          </CardTitle>
          {paper.analysis && (
            <Badge className={`shrink-0 ${getDecisionColor(paper.analysis.readingDecision)}`}>
              {getDecisionLabel(paper.analysis.readingDecision)}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {paper.authors.slice(0, 2).map((a) => a.name).join(", ")}
          {paper.authors.length > 2 && ` 외 ${paper.authors.length - 2}명`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {paper.analysis?.abstractSummary && (
          <p className="text-sm text-muted-foreground">
            {truncateText(paper.analysis.abstractSummary, 150)}
          </p>
        )}

        {paper.analysis?.keyFindings && paper.analysis.keyFindings.length > 0 && (
          <div className="text-xs">
            <span className="font-medium">주요 발견:</span>
            <ul className="list-disc list-inside text-muted-foreground">
              {paper.analysis.keyFindings.slice(0, 2).map((f, i) => (
                <li key={i}>{truncateText(f, 50)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {paper.journal && (
            <span className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {truncateText(paper.journal, 25)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(paper.publicationDate)}
          </span>
          <span className="flex items-center gap-1">
            <Quote className="w-3 h-3" />
            {paper.citationCount}
          </span>
          {paper.analysis && (
            <span className="ml-auto font-medium">
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
