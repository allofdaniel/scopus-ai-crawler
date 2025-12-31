"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getPaper } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, getDecisionLabel, getDecisionColor } from "@/lib/utils";
import {
  ArrowLeft,
  ExternalLink,
  Quote,
  Calendar,
  BookOpen,
  Users,
  FileText,
  Brain,
  Loader2,
  CheckCircle,
  AlertCircle,
  Lightbulb,
} from "lucide-react";

export default function PaperDetailPage() {
  const params = useParams();
  const paperId = params.id as string;

  const { data: paper, isLoading, error } = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => getPaper(paperId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <p className="text-muted-foreground">논문을 찾을 수 없습니다.</p>
        <Link href="/">
          <Button className="mt-4">홈으로 돌아가기</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        돌아가기
      </Link>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-2xl leading-tight mb-2">
                {paper.title}
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {paper.authors.map((a) => a.name).join(", ")}
              </CardDescription>
            </div>
            {paper.analysis && (
              <Badge className={`text-base ${getDecisionColor(paper.analysis.readingDecision)}`}>
                {getDecisionLabel(paper.analysis.readingDecision)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {paper.journal && (
              <span className="flex items-center gap-1">
                <BookOpen className="w-4 h-4" />
                {paper.journal}
                {paper.volume && `, Vol. ${paper.volume}`}
                {paper.issue && ` (${paper.issue})`}
                {paper.pages && `, pp. ${paper.pages}`}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(paper.publicationDate)}
            </span>
            <span className="flex items-center gap-1">
              <Quote className="w-4 h-4" />
              {paper.citationCount} 인용
            </span>
            {paper.influentialCitationCount && paper.influentialCitationCount > 0 && (
              <span className="text-green-600">
                ({paper.influentialCitationCount} 영향력 있는 인용)
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {paper.doi && (
              <Button variant="outline" size="sm" asChild>
                <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  DOI: {paper.doi}
                </a>
              </Button>
            )}
            {paper.openAccessUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={paper.openAccessUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="w-4 h-4 mr-1" />
                  PDF 보기
                </a>
              </Button>
            )}
            {paper.publisherUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={paper.publisherUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  출판사 페이지
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {paper.analysis && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              AI 분석 결과
            </CardTitle>
            <CardDescription>
              관련도: {(paper.analysis.relevanceScore * 100).toFixed(0)}% |
              신뢰도: {(paper.analysis.confidenceScore * 100).toFixed(0)}%
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-medium mb-2">읽기 판단</h4>
              <p className="text-muted-foreground">{paper.analysis.readingReason}</p>
            </div>

            <div>
              <h4 className="font-medium mb-2">요약</h4>
              <p className="text-muted-foreground">{paper.analysis.abstractSummary}</p>
            </div>

            {paper.analysis.keyFindings && paper.analysis.keyFindings.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-1">
                  <Lightbulb className="w-4 h-4 text-yellow-500" />
                  주요 발견
                </h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  {paper.analysis.keyFindings.map((finding, i) => (
                    <li key={i}>{finding}</li>
                  ))}
                </ul>
              </div>
            )}

            {paper.analysis.methodology && (
              <div>
                <h4 className="font-medium mb-2">방법론</h4>
                <p className="text-muted-foreground">{paper.analysis.methodology}</p>
              </div>
            )}

            {paper.analysis.limitations && paper.analysis.limitations.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  제한점
                </h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  {paper.analysis.limitations.map((limitation, i) => (
                    <li key={i}>{limitation}</li>
                  ))}
                </ul>
              </div>
            )}

            {paper.analysis.suggestedActions && paper.analysis.suggestedActions.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  권장 조치
                </h4>
                <div className="flex flex-wrap gap-2">
                  {paper.analysis.suggestedActions.map((action, i) => (
                    <Badge key={i} variant="outline">
                      {action === "read_full" && "전문 읽기"}
                      {action === "check_figures" && "그림/표 확인"}
                      {action === "follow_references" && "참고문헌 추적"}
                      {action === "cite" && "인용하기"}
                      {action === "archive" && "보관"}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {paper.analysis.relevanceTopics && paper.analysis.relevanceTopics.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">관련 주제</h4>
                <div className="flex flex-wrap gap-2">
                  {paper.analysis.relevanceTopics.map((topic, i) => (
                    <Badge key={i} variant="secondary">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {paper.abstract && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>초록</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{paper.abstract}</p>
          </CardContent>
        </Card>
      )}

      {paper.keywords && paper.keywords.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>키워드</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {paper.keywords.map((keyword, i) => (
                <Badge key={i} variant="outline">
                  {keyword}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {paper.references && paper.references.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>참고문헌 ({paper.references.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {paper.references.slice(0, 20).map((ref, i) => (
                <div key={i} className="text-sm text-muted-foreground">
                  {ref.includes("/") ? (
                    <a
                      href={`https://doi.org/${ref}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {ref}
                    </a>
                  ) : (
                    <span>{ref}</span>
                  )}
                </div>
              ))}
              {paper.references.length > 20 && (
                <p className="text-sm text-muted-foreground">
                  ... 외 {paper.references.length - 20}개
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 text-sm text-muted-foreground text-center">
        <p>수집 출처: {paper.source} | 발견일: {formatDate(paper.discoveredAt)}</p>
      </div>
    </div>
  );
}
