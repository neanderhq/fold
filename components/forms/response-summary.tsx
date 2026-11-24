import { useEffect, useState } from "react";
import { BarChart3, Star } from "lucide-react";
import { api } from "@/lib/api-client";
import type { QuestionSummary } from "@/lib/response-summary";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorNotice, Loading } from "./shared";

export function ResponseSummary({ id, query }: { id: string; query: string }) {
  const [summaries, setSummaries] = useState<QuestionSummary[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setSummaries(null); setError("");
    api<QuestionSummary[]>(`/api/forms/${id}/summary?${query}`).then(data => { if (active) setSummaries(data); }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [id, query]);
  if (error) return <ErrorNotice message={error} />;
  if (!summaries) return <Loading />;
  if (!summaries.length) return <Card className="border-dashed shadow-none"><CardContent className="py-12 text-center"><BarChart3 className="mx-auto mb-4 size-7 text-muted-foreground" /><h2 className="text-lg">No answer summaries yet</h2><p className="mt-2 text-muted-foreground">Summaries appear here when your rating and choice questions receive answers.</p></CardContent></Card>;
  return <section aria-label="Answer summaries"><p className="mb-5 text-sm text-muted-foreground">All responses matching your filters. Questions are summarized as each respondent saw them.</p><div className="grid items-start gap-5 lg:grid-cols-2">{summaries.map(summary => <Card key={summary.key} className="min-w-0 shadow-none"><CardContent className="p-6">
    <h2 className="break-words text-base">{summary.label}</h2><p className="mt-2 text-xs text-muted-foreground">{summary.answered} of {summary.responses} responses answered this question</p>
    {summary.average !== null && <p className="fold-average"><Star aria-hidden="true" /><strong>{summary.average.toFixed(1)}</strong><span>/ {summary.options.length} average rating</span></p>}
    <div className="mt-6 space-y-4">{summary.options.map(option => <div key={option.label}><div className="mb-2 flex items-start justify-between gap-4 text-sm"><span className="break-words">{summary.type === "rating" ? `${option.label} ${option.label === "1" ? "star" : "stars"}` : option.label}</span><span className="shrink-0 text-muted-foreground">{option.count} · {summary.answered ? Math.round(option.count / summary.answered * 100) : 0}%</span></div><progress className="fold-summary-progress" aria-label={option.label} value={option.count} max={summary.answered || 1} /></div>)}</div>
  </CardContent></Card>)}</div></section>;
}
