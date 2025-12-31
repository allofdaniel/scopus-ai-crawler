"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getQueries, SearchQuery } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { History, FileText, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

export function QueryList() {
  const { data: queries, isLoading, error } = useQuery({
    queryKey: ["queries"],
    queryFn: getQueries,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return (
          <Badge variant="info" className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            진행 중
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            완료
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            실패
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            대기 중
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          검색 기록을 불러오는데 실패했습니다.
        </CardContent>
      </Card>
    );
  }

  if (!queries || queries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            검색 기록
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-8">
          아직 검색 기록이 없습니다. 위에서 새 검색을 시작하세요!
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5" />
          검색 기록
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {queries.map((query: SearchQuery) => (
            <Link
              key={query.id}
              href={`/queries/${query.id}`}
              className="block"
            >
              <div className="p-4 border rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {query.keywords.map((keyword, i) => (
                        <Badge key={i} variant="outline">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {query.paperCount} 논문
                      </span>
                      <span>{formatDate(query.createdAt)}</span>
                    </div>
                  </div>
                  <div className="ml-4">
                    {getStatusBadge(query.status)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
