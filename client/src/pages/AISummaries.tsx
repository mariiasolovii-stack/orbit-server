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
            <p className="text-muted-foreground mt-2">Daily AI-powered performance analysis and alerts</p>
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
            AI summaries analyze engagement, posting patterns, content quality, and platform-specific performance. Flags help identify optimization opportunities.
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
