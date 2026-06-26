import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2, Users, FileText, DollarSign, AlertCircle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    activeCreators: 0,
    trialCreators: 0,
    totalPosts: 0,
    totalViews: 0,
    payoutsOwed: 0,
  });

  const creatorsQuery = trpc.creators.list.useQuery();
  const postsQuery = trpc.posts.list.useQuery();
  const payoutsQuery = trpc.payouts.calculatePending.useQuery();
  const syncTrackrMutation = trpc.trackr.sync.useMutation({
    onSuccess: (result: any) => {
      postsQuery.refetch();
      creatorsQuery.refetch();
      const parts: string[] = [];
      if (result?.newPosts) parts.push(`${result.newPosts} new post${result.newPosts === 1 ? '' : 's'}`);
      if (result?.updatedPosts) parts.push(`${result.updatedPosts} updated`);
      if (result?.newCreators) parts.push(`${result.newCreators} new creator${result.newCreators === 1 ? '' : 's'}`);
      const detail = parts.length ? parts.join(', ') : `${result?.fetched ?? 0} posts checked, all up to date`;
      toast.success(`Trackr sync complete: ${detail}`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to sync Trackr posts');
    },
  });

  useEffect(() => {
    if (creatorsQuery.data && postsQuery.data && payoutsQuery.data) {
      const activeCreators = creatorsQuery.data.filter(c => c.status === 'active').length;
      const trialCreators = creatorsQuery.data.filter(c => c.status === 'trial').length;
      const totalViews = postsQuery.data.reduce((sum, p) => sum + (p.views || 0), 0);
      const payoutsOwed = Object.values(payoutsQuery.data).reduce((sum, amount) => sum + amount, 0);

      setStats({
        activeCreators,
        trialCreators,
        totalPosts: postsQuery.data.length,
        totalViews,
        payoutsOwed,
      });
    }
  }, [creatorsQuery.data, postsQuery.data, payoutsQuery.data]);

  const isLoading = creatorsQuery.isLoading || postsQuery.isLoading || payoutsQuery.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-2">Welcome back, {user?.name}. Here's your UGC program at a glance.</p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Creators</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeCreators}</div>
              <p className="text-xs text-muted-foreground">Promoted creators</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Trial Creators</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.trialCreators}</div>
              <p className="text-xs text-muted-foreground">In trial period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPosts}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Views</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(stats.totalViews / 1000).toFixed(0)}k</div>
              <p className="text-xs text-muted-foreground">Across all posts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Payouts Owed</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.payoutsOwed}</div>
              <p className="text-xs text-muted-foreground">Current cycle</p>
            </CardContent>
          </Card>
        </div>

        {/* Trial Creator Progress */}
        {creatorsQuery.data?.filter(c => c.status === 'trial').length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trial Creator Progress</CardTitle>
              <CardDescription>Days remaining and performance toward 10k view goal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {creatorsQuery.data
                .filter(c => c.status === 'trial')
                .map((creator) => {
                  const trialDays = 14;
                  const startDate = new Date(creator.createdAt);
                  const endDate = new Date(startDate.getTime() + trialDays * 24 * 60 * 60 * 1000);
                  const today = new Date();
                  const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const daysUsed = trialDays - Math.max(0, daysRemaining);
                  const progressPercent = (daysUsed / trialDays) * 100;
                  
                  const creatorPosts = postsQuery.data?.filter(p => p.creatorId === creator.id) || [];
                  const creatorViews = creatorPosts.reduce((sum, p) => sum + (p.views || 0), 0);
                  const viewProgress = Math.min((creatorViews / 10000) * 100, 100);
                  
                  return (
                    <div key={creator.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{creator.name}</p>
                        <Badge variant="secondary" className="text-xs">{Math.max(0, daysRemaining)} days left</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Trial Progress</span>
                          <span>{daysUsed}/{trialDays} days</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${progressPercent}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>View Goal (10k)</span>
                          <span>{creatorViews.toLocaleString()} / 10,000</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-green-600 h-2 rounded-full" style={{ width: `${viewProgress}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        ) : null}

        {/* Alerts & Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {creatorsQuery.data?.filter(c => c.docusignStatus === 'pending').length ? (
                <div className="text-sm">
                  <p className="font-medium">{creatorsQuery.data.filter(c => c.docusignStatus === 'pending').length} contracts pending signature</p>
                  <p className="text-xs text-muted-foreground">Send DocuSign reminders</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">All systems nominal</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              size="sm"
              onClick={() => syncTrackrMutation.mutate()}
              disabled={syncTrackrMutation.isPending}
            >
              {syncTrackrMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Sync Trackr Posts
            </Button>
            <Button variant="outline" className="w-full justify-start" size="sm">
              Generate Morning Message
            </Button>
            </CardContent>
          </Card>
        </div>

        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Posts This Month</CardTitle>
            <CardDescription>Highest performing content</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : postsQuery.data && postsQuery.data.length > 0 ? (
              <div className="space-y-4">
                {postsQuery.data
                  .sort((a, b) => (b.views || 0) - (a.views || 0))
                  .slice(0, 5)
                  .map((post) => (
                    <div key={post.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                      <div>
                        <p className="font-medium text-sm">{post.platform}</p>
                        <p className="text-xs text-muted-foreground">{new Date(post.postDate).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{(post.views || 0).toLocaleString()} views</p>
                        <Badge variant={post.reviewStatus === 'approved' ? 'default' : 'secondary'} className="text-xs mt-1">
                          {post.reviewStatus}
                        </Badge>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No posts yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
