import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Trash2, CheckCircle, Clock, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function PostTracker() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    creatorId: '',
    platform: 'TikTok',
    postDate: new Date().toISOString().split('T')[0],
    postUrl: '',
    views: 0,
    reviewStatus: 'pending' as const,
  });

  const creatorsQuery = trpc.creators.list.useQuery();
  const postsQuery = trpc.posts.list.useQuery();
  const syncTrackrMutation = trpc.trackr.sync.useMutation({
    onSuccess: () => {
      postsQuery.refetch();
      toast.success('Trackr posts synced successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to sync Trackr posts');
    },
  });
  const createMutation = trpc.posts.create.useMutation({
    onSuccess: () => {
      postsQuery.refetch();
      setIsOpen(false);
      setFormData({
        creatorId: '',
        platform: 'TikTok',
        postDate: new Date().toISOString().split('T')[0],
        postUrl: '',
        views: 0,
        reviewStatus: 'pending',
      });
      toast.success('Post added successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create post');
    },
  });

  const approveMutation = trpc.posts.approve.useMutation({
    onSuccess: () => {
      postsQuery.refetch();
      toast.success('Post approved');
    },
  });

  const deleteMutation = trpc.posts.delete.useMutation({
    onSuccess: () => {
      postsQuery.refetch();
      toast.success('Post deleted');
    },
  });

  const handleSubmit = () => {
    if (!formData.creatorId) {
      toast.error('Creator is required');
      return;
    }

    createMutation.mutate({
      creatorId: formData.creatorId,
      platform: formData.platform,
      postDate: new Date(formData.postDate),
      postUrl: formData.postUrl,
      views: formData.views,
      reviewStatus: formData.reviewStatus,
    });
  };

  const getCreatorName = (creatorId: string | null) => {
    if (!creatorId) return 'Unknown';
    return creatorsQuery.data?.find(c => c.id === creatorId)?.name || 'Unknown';
  };

  const statusIcon = (status: string | null) => {
    if (!status) return null;
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Post Tracker</h1>
            <p className="text-muted-foreground mt-2">Track and manage all creator posts</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Log Post
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log New Post</DialogTitle>
                <DialogDescription>Add a new post to track</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="creator">Creator *</Label>
                  <Select value={formData.creatorId} onValueChange={(value) => setFormData({ ...formData, creatorId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select creator" />
                    </SelectTrigger>
                    <SelectContent>
                      {creatorsQuery.data?.map((creator) => (
                        <SelectItem key={creator.id} value={creator.id}>
                          {creator.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="platform">Platform</Label>
                  <Select value={formData.platform} onValueChange={(value) => setFormData({ ...formData, platform: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="YouTube">YouTube</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="postDate">Post Date</Label>
                  <Input
                    id="postDate"
                    type="date"
                    value={formData.postDate}
                    onChange={(e) => setFormData({ ...formData, postDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="postUrl">Post URL</Label>
                  <Input
                    id="postUrl"
                    value={formData.postUrl}
                    onChange={(e) => setFormData({ ...formData, postUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label htmlFor="views">Views</Label>
                  <Input
                    id="views"
                    type="number"
                    value={formData.views}
                    onChange={(e) => setFormData({ ...formData, views: parseInt(e.target.value) })}
                  />
                </div>
                <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Log Post
                </Button>
              </div>
            </DialogContent>
            </Dialog>
            <Button 
              variant="outline"
              onClick={() => syncTrackrMutation.mutate()}
              disabled={syncTrackrMutation.isPending}
            >
              {syncTrackrMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Sync Trackr
            </Button>
          </div>
        </div>

        {postsQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : postsQuery.data && postsQuery.data.length > 0 ? (
          <div className="space-y-4">
            {postsQuery.data
              .sort((a, b) => new Date(b.postDate).getTime() - new Date(a.postDate).getTime())
              .map((post) => (
                <Card key={post.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold">{getCreatorName(post.creatorId || '')}</h3>
                          <Badge variant="outline">{post.platform}</Badge>
                          <div className="flex items-center gap-2">
                            {statusIcon(post.reviewStatus)}
                            <Badge variant={post.reviewStatus === 'approved' ? 'default' : post.reviewStatus === 'pending' ? 'secondary' : 'destructive'}>
                              {post.reviewStatus}
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                          <div>
                            <p className="font-medium text-foreground">{(post.views || 0).toLocaleString()} views</p>
                            <p>{new Date(post.postDate).toLocaleDateString()}</p>
                          </div>
                          {post.postUrl && (
                            <div>
                              <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                View Post →
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {post.reviewStatus !== 'approved' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveMutation.mutate({ id: post.id })}
                            disabled={approveMutation.isPending}
                          >
                            Approve
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteMutation.mutate({ id: post.id })}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">No posts yet. Log your first post to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
