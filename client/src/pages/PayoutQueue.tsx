import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Loader2, DollarSign, Info, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Breakdown panel for a single creator ────────────────────────────────────
function CreatorBreakdown({
  creatorId,
  year,
  month,
}: {
  creatorId: string;
  year: number;
  month: number;
}) {
  const input = useMemo(() => ({ creatorId, year, month }), [creatorId, year, month]);
  const { data, isLoading } = trpc.payouts.getBreakdown.useQuery(input);

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground py-2 px-1">No posts found for this period.</p>;
  }

  const countedPosts = data.filter(p => !p.isCrosspostDuplicate && p.reviewStatus === "approved");
  const crosspostPosts = data.filter(p => p.isCrosspostDuplicate);
  const pendingPosts = data.filter(p => p.reviewStatus !== "approved");

  return (
    <div className="mt-4 space-y-4">
      {/* Counted posts table */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Counted videos ({countedPosts.length}) — each earns $20 base + tier bonuses
        </p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-left px-3 py-2 font-medium">Platform</th>
                <th className="text-left px-3 py-2 font-medium">Caption</th>
                <th className="text-right px-3 py-2 font-medium">Views</th>
                <th className="text-right px-3 py-2 font-medium">Owed</th>
                <th className="text-center px-3 py-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {countedPosts.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {new Date(p.postDate).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={
                        p.platform === "TikTok"
                          ? "border-pink-300 text-pink-700 bg-pink-50"
                          : "border-purple-300 text-purple-700 bg-purple-50"
                      }
                    >
                      {p.platform}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate text-muted-foreground" title={p.title || ""}>
                    {p.title ? p.title.slice(0, 60) + (p.title.length > 60 ? "…" : "") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{(p.views || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700">
                    {p.payoutAmount > 0 ? `$${p.payoutAmount}` : <span className="text-muted-foreground text-xs">already paid</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.postUrl ? (
                      <a
                        href={p.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Crosspost duplicates */}
      {crosspostPosts.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Crosspost duplicates ({crosspostPosts.length}) — same video on 2nd platform, no extra $20
          </p>
          <div className="overflow-x-auto rounded-md border border-dashed border-muted">
            <table className="w-full text-sm opacity-70">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Platform</th>
                  <th className="text-left px-3 py-2 font-medium">Caption</th>
                  <th className="text-right px-3 py-2 font-medium">Views</th>
                  <th className="text-center px-3 py-2 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {crosspostPosts.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(p.postDate).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-muted-foreground">
                        {p.platform}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate text-muted-foreground" title={p.title || ""}>
                      {p.title ? p.title.slice(0, 60) + (p.title.length > 60 ? "…" : "") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{(p.views || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-center">
                      {p.postUrl ? (
                        <a
                          href={p.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending (unapproved) posts */}
      {pendingPosts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {pendingPosts.length} post(s) pending review — not counted until approved.
        </p>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function PayoutQueue() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth()); // 0-indexed
  const [expandedCreator, setExpandedCreator] = useState<string | null>(null);

  // Stable query input
  const period = useMemo(() => ({ year, month }), [year, month]);

  const utils = trpc.useUtils();
  const creatorsQuery = trpc.creators.listAll.useQuery();
  const payoutsQuery = trpc.payouts.calculatePending.useQuery(period);
  const payoutHistoryQuery = trpc.payouts.list.useQuery();

  const markPaidMutation = trpc.payouts.markPaid.useMutation({
    onSuccess: (res) => {
      toast.success(`Marked $${res.totalPaid.toLocaleString()} paid across ${res.postsPaid} post(s)`);
      utils.payouts.calculatePending.invalidate();
      utils.payouts.list.invalidate();
      utils.payouts.getBreakdown.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to mark as paid"),
  });

  const getCreatorName = (creatorId: string | null) => {
    if (!creatorId) return "Unknown";
    return creatorsQuery.data?.find((c) => c.id === creatorId)?.name || "Unknown";
  };

  const getCreatorStatus = (creatorId: string | null) => {
    if (!creatorId) return "unknown";
    return creatorsQuery.data?.find((c) => c.id === creatorId)?.status || "unknown";
  };

  const isLoading = creatorsQuery.isLoading || payoutsQuery.isLoading;

  const totalOwed = payoutsQuery.data
    ? Object.values(payoutsQuery.data).reduce((sum, amount) => sum + amount, 0)
    : 0;

  const goPrevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };

  const goNextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const years = useMemo(() => {
    const current = now.getUTCFullYear();
    return [current - 2, current - 1, current, current + 1];
  }, []);

  const toggleBreakdown = (creatorId: string) => {
    setExpandedCreator(prev => prev === creatorId ? null : creatorId);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payout Queue</h1>
          <p className="text-muted-foreground mt-2">
            Amounts owed for the selected calendar-month pay period, plus full history
          </p>
        </div>

        {/* Pay period selector */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="icon" onClick={goPrevMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={m} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={goNextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary Card */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {MONTH_NAMES[month]} {year} Pay Period
            </CardTitle>
            <CardDescription>
              Pay periods run from the 1st to the last day of each calendar month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${totalOwed.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground mt-2">
              Total owed to {Object.keys(payoutsQuery.data || {}).length} creator(s) this period
            </p>
          </CardContent>
        </Card>

        {/* How payouts are calculated */}
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground flex gap-3">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium text-foreground">How payouts are calculated:</span>{" "}
            Every creator earns a <strong>$20 base per original qualifying video</strong> (300+ views).
            Crossposting the same video to a second platform does NOT earn a second $20.
            Bonuses are retroactive and incremental:{" "}
            10k → +$10, 25k → +$50, 50k → +$150, 100k → +$300, 250k → +$400, 1M → +$500, 1.5M → +$1,000, 5M → +$1,500.
            Click <strong>"See breakdown"</strong> on any creator to see every video counted.
          </div>
        </div>

        {/* Current Payouts */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Payouts Owed — {MONTH_NAMES[month]} {year}</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : payoutsQuery.data && Object.keys(payoutsQuery.data).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(payoutsQuery.data)
                .sort(([, a], [, b]) => b - a)
                .map(([creatorId, amount]) => {
                  const isExpanded = expandedCreator === creatorId;
                  return (
                    <Card key={creatorId}>
                      <CardContent className="pt-6">
                        {/* Header row */}
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{getCreatorName(creatorId)}</h3>
                            <Badge variant="outline" className="mt-2">
                              {getCreatorStatus(creatorId)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-2xl font-bold">${amount.toLocaleString()}</p>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                disabled={markPaidMutation.isPending}
                                onClick={() => markPaidMutation.mutate({ creatorId, year, month })}
                              >
                                {markPaidMutation.isPending &&
                                markPaidMutation.variables?.creatorId === creatorId ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Mark Paid"
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleBreakdown(creatorId)}
                                className="flex items-center gap-1"
                              >
                                {isExpanded ? (
                                  <><ChevronUp className="h-3 w-3" /> Hide</>
                                ) : (
                                  <><ChevronDown className="h-3 w-3" /> See breakdown</>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Expandable breakdown */}
                        {isExpanded && (
                          <CreatorBreakdown
                            creatorId={creatorId}
                            year={year}
                            month={month}
                          />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">
                  No payouts owed for {MONTH_NAMES[month]} {year}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Payout History */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Payout History</h2>
          {payoutHistoryQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : payoutHistoryQuery.data && payoutHistoryQuery.data.length > 0 ? (
            <div className="space-y-3">
              {payoutHistoryQuery.data.map((payout) => (
                <Card key={payout.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{getCreatorName(payout.creatorId)}</h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(payout.payoutDate).toLocaleDateString()} • {payout.payoutType}
                        </p>
                      </div>
                      <p className="text-lg font-semibold">${payout.amount.toLocaleString()}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">No payout history yet</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
