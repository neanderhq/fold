"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { answerText, blocksOf, isBlockVisible, isContent } from "@/lib/form-schema";
import type { SavedResponse } from "@/lib/form-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorNotice, FormNav, Loading, OwnerShell } from "./shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponseSummary } from "./response-summary";
import { ResponseRow } from "./response-row";

type ResponsePage = { records: SavedResponse[]; total: number; page: number; pageSize: number };

export function Responses({ id, initialResponseId }: { id: string; initialResponseId?: string }) {
  const [result, setResult] = useState<ResponsePage>({ records: [], total: 0, page: 1, pageSize: 20 });
  const [selected, setSelected] = useState<SavedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("page=1");
  const [unfilteredTotal, setUnfilteredTotal] = useState<number | null>(null);
  const [view, setView] = useState("responses");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const selectionRequest = useRef(0);
  const openedInitial = useRef(false);
  useEffect(() => {
    if (!selected || !window.matchMedia("(width < 48rem)").matches) return;
    detailHeading.current?.focus({ preventScroll: true });
    detailHeading.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [selected]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setSelected(null);
    Promise.all([api<ResponsePage>(`/api/forms/${id}/responses?${query}`), api<ResponsePage>(`/api/forms/${id}/responses?page=1`)]).then(([data, unfiltered]) => { if (active) { setResult(data); setUnfilteredTotal(unfiltered.total); } }).catch((cause) => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; selectionRequest.current++; };
  }, [id, query]);
  useEffect(() => {
    if (!loading && initialResponseId && !openedInitial.current) {
      openedInitial.current = true;
      void open(initialResponseId);
    }
  }, [loading, initialResponseId]);

  function filter(page: number) { setQuery(new URLSearchParams({ page: String(page), q: search, from, to }).toString()); }
  function clearFilters() { setSearch(""); setFrom(""); setTo(""); setQuery("page=1"); }
  async function open(responseId: string) {
    const request = ++selectionRequest.current;
    setError("");
    try {
      const response = await api<SavedResponse>(`/api/forms/${id}/responses/${responseId}`);
      if (request === selectionRequest.current) setSelected(response);
    }
    catch (cause) { if (request === selectionRequest.current) setError(cause instanceof Error ? cause.message : "Could not load response."); }
  }
  async function exportCsv() {
    try {
      const response = await fetch(`/api/forms/${id}/export?${query}`);
      if (!response.ok) { const data = await response.json(); throw new Error(data.error); }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `fold-${id}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); }
  }
  return <OwnerShell navigation={<FormNav id={id} active="responses" />}><Link href="/" className="mb-6 inline-block text-sm hover:underline">← All forms</Link><div className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><h1>Responses</h1><p className="mt-3 text-muted-foreground">Original questions and answers, preserved with every submission.</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/forms/${id}/integrations`}>Integrations</Link></Button><Button variant="outline" onClick={exportCsv}>Export CSV</Button></div></div>
    <form className="mb-8 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); filter(1); }}><div className="space-y-2"><Label htmlFor="search">Search responses</Label><Input id="search" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Answers or historical labels" /></div><div className="space-y-2"><Label htmlFor="from">From (UTC)</Label><Input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="to">To (UTC)</Label><Input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div><Button>Apply filters</Button></form>
    {error && <div className="mb-6"><ErrorNotice message={error} /></div>}
    <Tabs value={view} onValueChange={setView}><TabsList aria-label="Response views" className="mb-6"><TabsTrigger value="responses">Responses</TabsTrigger><TabsTrigger value="summary">Summary</TabsTrigger></TabsList><TabsContent value="summary">{view === "summary" && <ResponseSummary id={id} query={query} />}</TabsContent><TabsContent value="responses">
    {loading ? <Loading /> : <div className="grid items-start gap-6 md:grid-cols-2"><section aria-label="Response list" className="min-w-0 space-y-3"><p className="mb-4 text-sm text-muted-foreground">{result.total} {result.total === 1 ? "response" : "responses"}{unfilteredTotal !== null && unfilteredTotal !== result.total ? ` of ${unfilteredTotal} total` : ""}</p>{result.records.length === 0 ? <Card className="shadow-none"><CardContent className="py-12 text-center"><h2 className="text-lg">{unfilteredTotal === 0 ? "No responses yet" : "No matching responses"}</h2><p className="mt-2 text-muted-foreground">{unfilteredTotal === 0 ? "Share your published form to start collecting responses." : "Try another search or clear your filters to see every response."}</p>{unfilteredTotal !== 0 && <Button className="mt-5" variant="outline" onClick={clearFilters}>Clear filters</Button>}</CardContent></Card> : result.records.map(record => <ResponseRow key={record.id} record={record} selected={selected?.id === record.id} onSelect={() => void open(record.id)} />)}<div className="flex flex-wrap items-center gap-3 pt-4"><Button variant="outline" disabled={result.page <= 1} onClick={() => { const params = new URLSearchParams(query); params.set("page", String(result.page - 1)); setQuery(params.toString()); }}>Previous</Button><span className="text-sm">Page {result.page}</span><Button variant="outline" disabled={result.page * result.pageSize >= result.total} onClick={() => { const params = new URLSearchParams(query); params.set("page", String(result.page + 1)); setQuery(params.toString()); }}>Next</Button></div></section>
      <section aria-label="Response detail" className="min-w-0">{selected ? <Card className="shadow-none"><CardContent className="space-y-5 p-6"><h2 ref={detailHeading} tabIndex={-1} className="scroll-mt-32 break-words text-lg focus-visible:outline-2 focus-visible:outline-ring">{selected.schemaSnapshot.title}</h2><p className="text-xs text-muted-foreground">{new Date(selected.createdAt).toLocaleString()}</p>{blocksOf(selected.schemaSnapshot).filter((block) => !isContent(block) && isBlockVisible(block, selected.answers)).map((block) => <div key={block.id}><h3 className="break-words text-sm font-medium">{block.label}</h3><p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{answerText(selected.answers[block.id]) || "No answer"}</p></div>)}</CardContent></Card> : <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">Select a response to see its original questions and answers.</div>}</section></div>}
    </TabsContent></Tabs>
  </OwnerShell>;
}
