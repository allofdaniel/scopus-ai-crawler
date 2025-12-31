"use client";

import { Paper } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, getDecisionLabel, getDecisionColor, truncateText } from "@/lib/utils";
import { ExternalLink, BookOpen, Quote, Calendar } from "lucide-react";
import Link from "next/link";

interface PaperCardProps {
  paper: Paper;
}

export function PaperCard({ paper }: PaperCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-lg leading-tight">
              <Link
                href={`/papers/${paper.id}`}
                className="hover:text-primary transition-colors"
              >
                {paper.title}
              </Link>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {paper.authors.slice(0, 3).map((a) => a.name).join(", ")}
              {paper.authors.length > 3 && ` 외 ${paper.authors.length - 3}명`}
            </p>
          </div>
          {paper.analysis && (
            <Badge className={getDecisionColor(paper.analysis.readingDecision)}>
              {getDecisionLabel(paper.analysis.readingDecision)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {paper.analysis?.abstractSummary && (
          <p className="text-sm text-muted-foreground">
            {truncateText(paper.analysis.abstractSummary, 200)}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {paper.journal && (
            <span className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {paper.journal}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(paper.publicationDate)}
          </span>
          <span className="flex items-center gap-1">
            <Quote className="w-3 h-3" />
            {paper.citationCount} 인용
          </span>
          {paper.analysis && (
            <span className="ml-auto">
              관련도: {(paper.analysis.relevanceScore * 100).toFixed(0)}%
            </span>
          )}
        </div>

        {paper.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {paper.keywords.slice(0, 5).map((keyword, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {keyword}
              </Badge>
            ))}
            {paper.keywords.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{paper.keywords.length - 5}
              </Badge>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Link href={`/papers/${paper.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              상세 보기
            </Button>
          </Link>
          {paper.openAccessUrl && (
            <Button
              variant="ghost"
              size="sm"
              asChild
            >
              <a href={paper.openAccessUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" />
                PDF
              </a>
            </Button>
          )}
          {paper.doi && (
            <Button
              variant="ghost"
              size="sm"
              asChild
            >
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                DOI
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
