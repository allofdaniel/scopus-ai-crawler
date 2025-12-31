import { SearchForm } from "@/components/search-form";
import { QueryList } from "@/components/query-list";
import { StatsOverview } from "@/components/stats-overview";
import { BookOpen, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="container mx-auto py-8 px-4">
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

      <StatsOverview />

      <div className="grid gap-6 mt-8 lg:grid-cols-2">
        <SearchForm />
        <QueryList />
      </div>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>Scopus, Semantic Scholar, OpenAlex, CrossRef API를 활용합니다.</p>
        <p className="mt-1">Gemini AI가 논문을 분석하여 읽기 우선순위를 제안합니다.</p>
      </footer>
    </div>
  );
}
