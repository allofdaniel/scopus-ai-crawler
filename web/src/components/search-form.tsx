"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createQuery } from "@/lib/api";
import { Search, Plus, X, Loader2 } from "lucide-react";

export function SearchForm() {
  const [keywords, setKeywords] = useState<string[]>([""]);
  const [context, setContext] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minCitations, setMinCitations] = useState("");
  const [followRefs, setFollowRefs] = useState(true);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createQuery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queries"] });
      setKeywords([""]);
      setContext("");
    },
  });

  const addKeyword = () => {
    setKeywords([...keywords, ""]);
  };

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
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      minCitations: minCitations ? parseInt(minCitations, 10) : undefined,
      includeReferences: followRefs,
      maxReferenceDepth: 2,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" />
          새 논문 검색
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
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="예: 항공 안전 시스템에서 머신러닝 적용에 관한 연구를 진행 중입니다. 특히 이상 탐지와 예측 유지보수에 관심이 있습니다."
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? "간단히 ▲" : "고급 옵션 ▼"}
            </Button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 p-4 bg-muted rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">시작 날짜</label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">종료 날짜</label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">최소 인용수</label>
                <Input
                  type="number"
                  placeholder="예: 10"
                  value={minCitations}
                  onChange={(e) => setMinCitations(e.target.value)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="followRefs"
                  checked={followRefs}
                  onChange={(e) => setFollowRefs(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <label htmlFor="followRefs" className="text-sm">
                  참고문헌 추적 (더 많은 관련 논문 발견)
                </label>
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                검색 중...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                논문 검색 시작
              </>
            )}
          </Button>

          {mutation.isSuccess && (
            <p className="text-sm text-green-600">
              검색이 시작되었습니다! 결과는 아래에서 확인하세요.
            </p>
          )}

          {mutation.isError && (
            <p className="text-sm text-red-600">
              오류가 발생했습니다. 다시 시도해주세요.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
