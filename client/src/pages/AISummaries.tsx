import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { Loader2, AlertCircle, TrendingDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function AISummaries() {
  const [summaries, setSummaries] = useState<Record<string, any>>({});
  const creatorsQuery = trpc.creators.list.useQuery();
  const generateMutation = trpc.summaries.generate.useMutation({
    onSuccess: (data) => {
      setSummaries(prev => ({ ...prev, [data.creatorId]: data }));
      toast.success('Summary generated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to generate summary');
    },
  });

  const generateAllMutation = trpc.summaries.generateAll.useMutation({
    onSuccess: (data) => {
      const newSummaries: Record<string, any> = {};
      data.forEach((summary: any) => {
        newSummaries[summary.creatorId] = summary;
      });
      setSummaries(newSummaries);
      toast.success('All summaries generated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to generate summaries');
    },
  });

  const handleGenerateSummary = (creatorId: string) => {
    generateMutation.mutate({ creatorId });
  };

  const handleGenerateAll = () => {
    generateAllMutation.mutate();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI Creator Summaries</h1>
            <p className="text-muted-foreground mt-2">AI analysis of each creator's whole profile plus the last 7 days</p>
          </div>
          <Button 
            onClick={handleGenerateAll}
            disabled={generateAllMutation.isPending}
          >
            {generateAllMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Generate All Summaries
          </Button>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
Summaries combine the creator's full posting history with their last 7 days: how engagement looks (likes + comments + shares + saves relative to views), their general posting schedule, TikTok vs Instagram and short- vs long-form performance, which posts work best, and flags for 2+ day breaks, posting more than once a day, posting under 5x/week, weak hashtags/captions, and neglected platforms.
          </AlertDescription>
        </Alert>

        {creatorsQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : creatorsQuery.data && creatorsQuery.data.length > 0 ? (
          <div className="grid gap-4">
            {creatorsQuery.data.map((creator) => {
              const summary = summaries[creator.id];
              return (
                <Card key={creator.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{creator.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {creator.status === 'trial' ? (
                            <Badge variant="secondary">Trial</Badge>
                          ) : (
                            <Badge>Active</Badge>
                          )}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {creator.platforms || 'No platforms'}
                          </span>
                        </CardDescription>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleGenerateSummary(creator.id)}
                        disabled={generateMutation.isPending}
                      >
                        {generateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Generate
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {summary ? (
                      <div className="space-y-4">
                        <div className="bg-muted p-4 rounded-lg">
                          <p className="text-sm">{summary.summary}</p>
                        </div>

                        {summary.metrics && summary.metrics.totalPosts > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-md border p-3">
                              <p className="text-xs text-muted-foreground">Total posts</p>
                              <p className="text-lg font-semibold">{summary.metrics.totalPosts}</p>
                              <p className="text-xs text-muted-foreground">{summary.metrics.postsLast7Days} in last 7d</p>
                            </div>
                            <div className="rounded-md border p-3">
                              <p className="text-xs text-muted-foreground">Avg views/post</p>
                              <p className="text-lg font-semibold">{summary.metrics.avgViewsAllTime.toLocaleString()}</p>
                              <p className="text-xs text-muted-foreground">{summary.metrics.avgViewsLast7Days.toLocaleString()} last 7d</p>
                            </div>
                            <div className="rounded-md border p-3">
                              <p className="text-xs text-muted-foreground">TikTok eng.</p>
                              <p className="text-lg font-semibold">{summary.metrics.tiktokEngagement}%</p>
                              <p className="text-xs text-muted-foreground">{summary.metrics.tiktokPosts} posts</p>
                            </div>
                            <div className="rounded-md border p-3">
                              <p className="text-xs text-muted-foreground">Instagram eng.</p>
                              <p className="text-lg font-semibold">{summary.metrics.instagramEngagement}%</p>
                              <p className="text-xs text-muted-foreground">{summary.metrics.instagramPosts} posts</p>
                            </div>
                          </div>
                        )}
                        
                        {summary.flags?.engagementIssues?.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-orange-500" />
                              Engagement Issues
                            </p>
                            <div className="space-y-1">
                              {summary.flags.engagementIssues.map((issue: string, i: number) => (
                                <p key={i} className="text-sm text-muted-foreground ml-6">• {issue}</p>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {summary.flags?.postingPatterns?.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <TrendingDown className="h-4 w-4 text-yellow-500" />
                              Posting Patterns
                            </p>
                            <div className="space-y-1">
                              {summary.flags.postingPatterns.map((pattern: string, i: number) => (
                                <p key={i} className="text-sm text-muted-foreground ml-6">• {pattern}</p>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {summary.flags?.contentQuality?.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-semibold flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-red-500" />
                              Content Quality
                            </p>
                            <div className="space-y-1">
                              {summary.flags.contentQuality.map((concern: string, i: number) => (
                                <p key={i} className="text-sm text-muted-foreground ml-6">• {concern}</p>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {summary.flags?.platformInsights?.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-semibold">Platform Insights</p>
                            <div className="space-y-1">
                              {summary.flags.platformInsights.map((insight: string, i: number) => (
                                <p key={i} className="text-sm text-muted-foreground ml-6">• {insight}</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-muted p-4 rounded-lg">
                        <p className="text-sm text-muted-foreground italic">
                          Generate a summary to see AI analysis and performance insights
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12">
              <p className="text-center text-muted-foreground">No creators found. Add creators to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
