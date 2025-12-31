"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getQuery, getPapersForQuery, getQuerySummary, SearchQuery, Paper } from "@/lib/api";
import { PaperCard } from "@/components/paper-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, getDecisionLabel, getDecisionColor } from "@/lib/utils";
import {
  ArrowLeft,
  FileText,
  Brain,
  Loader2,
  Filter,
  SortAsc,
  Sparkles,
} from "lucide-react";

type SortOption = "relevance" | "citations" | "date";

export default function QueryDetailPage() {
  const params = useParams();
  const queryId = params.id as string;
  const [decision, setDecision] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("relevance");
  const [showSummary, setShowSummary] = useState(false);

  const { data: query, isLoading: queryLoading } = useQuery({
    queryKey: ["query", queryId],
    queryFn: () => getQuery(queryId),
    refetchInterval: (data) =>
      data?.state.data?.status === "running" ? 3000 : false,
  });

  const { data: papers, isLoading: papersLoading } = useQuery({
    queryKey: ["papers", queryId, decision, sort],
    queryFn: () =>
      getPapersForQuery(queryId, {
        decision: decision || undefined,
        sort,
        limit: 100,
      }),
    enabled: !!query,
  });

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary", queryId],
    queryFn: () => getQuerySummary(queryId),
    enabled: showSummary && query?.status === "completed",
  });

  const decisions = ["must_read", "should_read", "maybe_read", "skip"];
  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "relevance", label: "관련도순" },
    { value: "citations", label: "인용순" },
    { value: "date", label: "최신순" },
  ];

  if (queryLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!query) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <p className="text-muted-foreground">검색을 찾을 수 없습니다.</p>
        <Link href="/">
          <Button className="mt-4">홈으로 돌아가기</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        돌아가기
      </Link>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 flex-wrap">
                {query.keywords.map((keyword: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-base">
                    {keyword}
                  </Badge>
                ))}
              </CardTitle>
              <CardDescription className="mt-2">
                {formatDate(query.createdAt)} 생성
              </CardDescription>
            </div>
            <Badge
              variant={query.status === "completed" ? "default" : "secondary"}
            >
              {query.status === "running" && (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              )}
              {query.status === "completed"
                ? "완료"
                : query.status === "running"
                ? "진행 중"
                : query.status === "failed"
                ? "실패"
                : "대기 중"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 text-sm">
            <span className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              {query.paperCount} 논문
            </span>
            {query.includeReferences && (
              <span className="text-muted-foreground">
                참고문헌 추적 (깊이: {query.maxReferenceDepth})
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {query.status === "completed" && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                AI 요약
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSummary(!showSummary)}
              >
                {showSummary ? "숨기기" : "요약 생성"}
              </Button>
            </div>
          </CardHeader>
          {showSummary && (
            <CardContent>
              {summaryLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI가 논문들을 요약하고 있습니다...
                </div>
              ) : summaryData ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {summaryData.summary.split("\n").map((line: string, i: number) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              ) : null}
            </CardContent>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">필터:</span>
          <Button
            variant={decision === null ? "default" : "outline"}
            size="sm"
            onClick={() => setDecision(null)}
          >
            전체
          </Button>
          {decisions.map((d) => (
            <Button
              key={d}
              variant={decision === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDecision(d)}
              className={decision === d ? getDecisionColor(d) : ""}
            >
              {getDecisionLabel(d)}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <SortAsc className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">정렬:</span>
          {sortOptions.map((option) => (
            <Button
              key={option.value}
              variant={sort === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => setSort(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {papersLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : papers && papers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {papers.map((paper: Paper) => (
            <PaperCard key={paper.id} paper={paper} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {query.status === "running" ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>논문을 수집하고 분석하는 중입니다...</p>
              </div>
            ) : (
              <p>해당 조건에 맞는 논문이 없습니다.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
