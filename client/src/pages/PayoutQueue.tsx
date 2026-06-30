import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Loader2, DollarSign, Info, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, ExternalLink, Download,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function PlatformBadge({ platform, isBonus }: { platform: string; isBonus?: boolean }) {
  const isTikTok = platform === "TikTok";
  return (
    <Badge
      variant="outline"
      className={
        isTikTok
          ? "border-pink-300 text-pink-700 bg-pink-50"
          : "border-purple-300 text-purple-700 bg-purple-50"
      }
    >
      {platform}{isBonus ? " ★" : ""}
    </Badge>
  );
}

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

  // Groups with both platforms = qualify for $20 base + bonus
  const dualPlatform = data.filter((p: any) => p.hasBothPlatforms && p.reviewStatus === "approved");
  // Groups with only one platform = no base pay
  const singlePlatform = data.filter((p: any) => !p.hasBothPlatforms && p.reviewStatus === "approved");
  const pendingGroups = data.filter((p: any) => p.reviewStatus !== "approved");

  return (
    <div className="mt-4 space-y-5">
      {/* Dual-platform videos (qualify for $20 base) */}
      {dualPlatform.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Dual-platform videos ({dualPlatform.length}) — posted on both TikTok &amp; Instagram → $20 base + bonus from higher views
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Caption</th>
                  <th className="text-right px-3 py-2 font-medium">TikTok views</th>
                  <th className="text-right px-3 py-2 font-medium">IG views</th>
                  <th className="text-right px-3 py-2 font-medium">Bonus from</th>
                  <th className="text-right px-3 py-2 font-medium">Owed</th>
                  <th className="text-center px-3 py-2 font-medium">Links</th>
                </tr>
              </thead>
              <tbody>
                {dualPlatform.map((p: any) => {
                  // Identify which post is TikTok and which is Instagram
                  const ttIsMain = p.platform === "TikTok";
                  const ttViews = ttIsMain ? p.views : p.partnerViews;
                  const igViews = ttIsMain ? p.partnerViews : p.views;
                  const ttUrl = ttIsMain ? p.postUrl : p.partnerPostUrl;
                  const igUrl = ttIsMain ? p.partnerPostUrl : p.postUrl;
                  const bonusIsTT = p.bonusPlatform === "TikTok";

                  return (
                    <tr key={p.id} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(p.postDate).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate text-muted-foreground" title={p.title || ""}>
                        {p.title ? p.title.slice(0, 55) + (p.title.length > 55 ? "…" : "") : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span className={bonusIsTT ? "font-bold text-foreground" : "text-muted-foreground"}>
                          {(ttViews || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span className={!bonusIsTT ? "font-bold text-foreground" : "text-muted-foreground"}>
                          {(igViews || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PlatformBadge platform={p.bonusPlatform} isBonus />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">
                        {p.payoutAmount > 0
                          ? `$${p.payoutAmount}`
                          : <span className="text-muted-foreground text-xs">already paid</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {ttUrl ? (
                            <a href={ttUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-pink-600 hover:underline text-xs">
                              TT <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                          {igUrl ? (
                            <a href={igUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-purple-600 hover:underline text-xs">
                              IG <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Single-platform videos (no base pay) */}
      {singlePlatform.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Single-platform only ({singlePlatform.length}) — not posted on both platforms → $0 base, not counted
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
                {singlePlatform.map((p: any) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(p.postDate).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <PlatformBadge platform={p.platform} />
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate text-muted-foreground" title={p.title || ""}>
                      {p.title ? p.title.slice(0, 55) + (p.title.length > 55 ? "…" : "") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{(p.views || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-center">
                      {p.postUrl ? (
                        <a href={p.postUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs">
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending (unapproved) */}
      {pendingGroups.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {pendingGroups.length} video group(s) pending review — not counted until approved.
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
  const generateInvoiceMutation = trpc.payouts.generateInvoice.useMutation();

  // Stable query input
  const period = useMemo(() => ({ year, month }), [year, month]);

  const utils = trpc.useUtils();
  const creatorsQuery = trpc.creators.listAll.useQuery();
  const payoutsQuery = trpc.payouts.calculatePending.useQuery(period);
  const payoutHistoryQuery = trpc.payouts.list.useQuery();

  const markPaidMutation = trpc.payouts.markPaid.useMutation({
    onSuccess: (res) => {
      toast.success(`Marked $${res.totalPaid.toLocaleString()} paid across ${res.postsPaid} video(s)`);
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
            A video earns a <strong>$20 base only if it was posted on both TikTok AND Instagram</strong>.
            Single-platform videos are not counted.
            The <strong>bonus is based on the higher view count</strong> across both platforms for that video (not per-platform).
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
                              <p className="text-2xl font-bold">${(amount as number).toLocaleString()}</p>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  markPaidMutation.mutate({ creatorId, year, month })
                                }
                                disabled={markPaidMutation.isPending}
                              >
                                {markPaidMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Mark Paid"
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  generateInvoiceMutation.mutate(
                                    { creatorId, year, month },
                                    {
                                      onSuccess: (data: any) => {
                                        const link = document.createElement('a');
                                        const blob = new Blob([Buffer.from(data.base64, 'base64')], {
                                          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        });
                                        link.href = URL.createObjectURL(blob);
                                        link.download = data.filename;
                                        link.click();
                                        toast.success(`Invoice downloaded: ${data.filename}`);
                                      },
                                      onError: () => {
                                        toast.error('Failed to generate invoice');
                                      },
                                    }
                                  );
                                }}
                                disabled={generateInvoiceMutation.isPending}
                              >
                                {generateInvoiceMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <><Download className="h-4 w-4 mr-1" /> Invoice</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleBreakdown(creatorId)}
                              >
                                {isExpanded ? (
                                  <><ChevronUp className="h-4 w-4 mr-1" /> Hide</>
                                ) : (
                                  <><ChevronDown className="h-4 w-4 mr-1" /> See breakdown</>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Expandable breakdown */}
                        {isExpanded && (
                          <CreatorBreakdown creatorId={creatorId} year={year} month={month} />
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
                  No payouts owed for {MONTH_NAMES[month]} {year}.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Payout History */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Payout History</h2>
          {payoutHistoryQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : payoutHistoryQuery.data && payoutHistoryQuery.data.length > 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left pb-3 font-medium">Date</th>
                        <th className="text-left pb-3 font-medium">Creator</th>
                        <th className="text-left pb-3 font-medium">Type</th>
                        <th className="text-right pb-3 font-medium">Amount</th>
                        <th className="text-left pb-3 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payoutHistoryQuery.data.map((payout: any) => (
                        <tr key={payout.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-3 text-muted-foreground">
                            {new Date(payout.payoutDate).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", year: "numeric",
                            })}
                          </td>
                          <td className="py-3">{getCreatorName(payout.creatorId)}</td>
                          <td className="py-3">
                            <Badge variant={payout.payoutType === "bonus" ? "default" : "secondary"}>
                              {payout.payoutType}
                            </Badge>
                          </td>
                          <td className="py-3 text-right font-semibold">${payout.amount}</td>
                          <td className="py-3 text-muted-foreground text-xs">{payout.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">No payout history yet.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
