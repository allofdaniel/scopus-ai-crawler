"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStats } from "@/lib/api";
import { FileText, Search, Brain, TrendingUp } from "lucide-react";

export function StatsOverview() {
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    refetchInterval: 10000,
  });

  const statCards = [
    {
      title: "총 논문",
      value: stats?.totalPapers || 0,
      icon: FileText,
      color: "text-blue-600",
    },
    {
      title: "검색 쿼리",
      value: stats?.totalQueries || 0,
      icon: Search,
      color: "text-purple-600",
    },
    {
      title: "AI 분석 완료",
      value: stats?.analyzedPapers || 0,
      icon: Brain,
      color: "text-green-600",
    },
    {
      title: "필독 논문",
      value: stats?.decisionBreakdown?.must_read || 0,
      icon: TrendingUp,
      color: "text-red-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
