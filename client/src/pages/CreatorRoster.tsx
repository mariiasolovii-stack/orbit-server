import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Edit2, Archive, CheckCircle, Clock, XCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const emptyForm = {
  name: '',
  email: '',
  status: 'trial' as 'trial' | 'active' | 'fired',
  compType: 'ppp' as 'ppp' | 'retainer',
  baseRate: 25,
  tiktokHandle: '',
  instagramHandle: '',
};

export default function CreatorRoster() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [formData, setFormData] = useState({ ...emptyForm });

  // Archive confirmation dialog state
  const [archiveTarget, setArchiveTarget] = useState<any | null>(null);
  const [keepSyncing, setKeepSyncing] = useState(true);

  const utils = trpc.useUtils();
  const creatorsQuery = trpc.creators.list.useQuery();
  const archivedQuery = trpc.creators.listArchived.useQuery();

  const refetchAll = () => {
    utils.creators.list.invalidate();
    utils.creators.listArchived.invalidate();
  };

  const createMutation = trpc.creators.create.useMutation({
    onSuccess: () => {
      refetchAll();
      setIsOpen(false);
      setFormData({ ...emptyForm });
      toast.success('Creator added successfully');
    },
    onError: (error) => toast.error(error.message || 'Failed to create creator'),
  });

  const updateMutation = trpc.creators.update.useMutation({
    onSuccess: () => {
      refetchAll();
      setIsOpen(false);
      setEditingId(null);
      setFormData({ ...emptyForm });
      toast.success('Creator updated successfully');
    },
    onError: (error) => toast.error(error.message || 'Failed to update creator'),
  });

  const promoteMutation = trpc.creators.promote.useMutation({
    onSuccess: () => { refetchAll(); toast.success('Creator promoted to active'); },
  });

  const fireMutation = trpc.creators.fire.useMutation({
    onSuccess: () => { refetchAll(); toast.success('Creator marked as fired (still tracked)'); },
  });

  const archiveMutation = trpc.creators.archive.useMutation({
    onSuccess: () => {
      refetchAll();
      setArchiveTarget(null);
      toast.success('Creator archived');
    },
    onError: (error) => toast.error(error.message || 'Failed to archive creator'),
  });

  const restoreMutation = trpc.creators.restore.useMutation({
    onSuccess: () => { refetchAll(); toast.success('Creator restored to roster'); },
  });

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error('Name is required');
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (creator: any) => {
    setEditingId(creator.id);
    setFormData({
      name: creator.name,
      email: creator.email || '',
      status: creator.status,
      compType: creator.compType,
      baseRate: creator.baseRate || 25,
      tiktokHandle: creator.tiktokHandle || '',
      instagramHandle: creator.instagramHandle || '',
    });
    setIsOpen(true);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'trial': return <Clock className="h-4 w-4 text-blue-600" />;
      case 'fired': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return null;
    }
  };

  const list = view === 'active' ? creatorsQuery.data : archivedQuery.data;
  const isLoading = view === 'active' ? creatorsQuery.isLoading : archivedQuery.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Creator Roster</h1>
            <p className="text-muted-foreground mt-2">Manage all creators in your UGC program</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingId(null); setFormData({ ...emptyForm }); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Creator
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Creator' : 'Add New Creator'}</DialogTitle>
                <DialogDescription>
                  {editingId ? 'Update creator information' : 'Add a new creator to your program'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Creator name" />
                </div>
                <div>
                  <Label htmlFor="email">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input id="email" type="email" value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="creator@example.com" />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="fired">Fired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="compType">Compensation Type</Label>
                  <Select value={formData.compType} onValueChange={(value: any) => setFormData({ ...formData, compType: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ppp">Per-Post</SelectItem>
                      <SelectItem value="retainer">Retainer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="baseRate">Base Rate ($)</Label>
                  <Input id="baseRate" type="number" value={formData.baseRate}
                    onChange={(e) => setFormData({ ...formData, baseRate: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label htmlFor="tiktok">TikTok Handle</Label>
                  <Input id="tiktok" value={formData.tiktokHandle}
                    onChange={(e) => setFormData({ ...formData, tiktokHandle: e.target.value })}
                    placeholder="username (with or without @)" />
                  <p className="text-xs text-muted-foreground mt-1">The @ is optional — we store it without.</p>
                </div>
                <div>
                  <Label htmlFor="instagram">Instagram Handle</Label>
                  <Input id="instagram" value={formData.instagramHandle}
                    onChange={(e) => setFormData({ ...formData, instagramHandle: e.target.value })}
                    placeholder="username (with or without @)" />
                </div>
                <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? 'Update Creator' : 'Add Creator'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as 'active' | 'archived')}>
          <TabsList>
            <TabsTrigger value="active">Roster {creatorsQuery.data ? `(${creatorsQuery.data.length})` : ''}</TabsTrigger>
            <TabsTrigger value="archived">Archived {archivedQuery.data ? `(${archivedQuery.data.length})` : ''}</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : list && list.length > 0 ? (
          <div className="grid gap-4">
            {list.map((creator: any) => (
              <Card key={creator.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{creator.name}</h3>
                        <div className="flex items-center gap-2">
                          {statusIcon(creator.status)}
                          <Badge variant={creator.status === 'active' ? 'default' : creator.status === 'trial' ? 'secondary' : 'destructive'}>
                            {creator.status}
                          </Badge>
                          {view === 'archived' && creator.syncEnabled === 0 && (
                            <Badge variant="outline">sync off</Badge>
                          )}
                          {view === 'archived' && creator.syncEnabled === 1 && (
                            <Badge variant="outline">still syncing</Badge>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">{creator.email || 'No email'}</p>
                          <p>{creator.compType === 'ppp' ? 'Per-Post' : 'Retainer'} • ${creator.baseRate}/post</p>
                        </div>
                        <div>
                          {creator.tiktokHandle && <p>TikTok: @{creator.tiktokHandle}</p>}
                          {creator.instagramHandle && <p>Instagram: @{creator.instagramHandle}</p>}
                        </div>
                      </div>
                      {creator.status === 'trial' && view === 'active' && (
                        <div className="mt-3">
                          <p className="text-xs text-muted-foreground">
                            In trial — paid on the same tiers as active creators until re-tagged "Active".
                          </p>
                        </div>
                      )}
                      {creator.docusignStatus && (
                        <div className="mt-3">
                          <Badge variant={creator.docusignStatus === 'signed' ? 'default' : 'secondary'}>
                            Contract: {creator.docusignStatus}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {view === 'active' ? (
                        <>
                          {creator.status === 'trial' && (
                            <Button size="sm" variant="outline"
                              onClick={() => promoteMutation.mutate({ id: creator.id })}
                              disabled={promoteMutation.isPending}>
                              Promote
                            </Button>
                          )}
                          {creator.status !== 'fired' && (
                            <Button size="sm" variant="outline"
                              onClick={() => fireMutation.mutate({ id: creator.id })}
                              disabled={fireMutation.isPending}>
                              Fire
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => handleEdit(creator)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline"
                            onClick={() => { setArchiveTarget(creator); setKeepSyncing(true); }}
                            title="Archive / remove from roster">
                            <Archive className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline"
                          onClick={() => restoreMutation.mutate({ id: creator.id })}
                          disabled={restoreMutation.isPending}>
                          <RotateCcw className="h-4 w-4 mr-2" /> Restore
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                {view === 'active'
                  ? 'No creators yet. Add your first creator to get started.'
                  : 'No archived creators.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Archive confirmation dialog */}
      <Dialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {archiveTarget?.name}?</DialogTitle>
            <DialogDescription>
              Archiving removes this creator from your active roster but keeps all of their posts and view
              history. You can restore them anytime from the Archived tab.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox id="keepSyncing" checked={keepSyncing}
              onCheckedChange={(c) => setKeepSyncing(c === true)} />
            <div className="space-y-1">
              <Label htmlFor="keepSyncing" className="cursor-pointer">Keep syncing their views from Trackr</Label>
              <p className="text-xs text-muted-foreground">
                Leave checked to keep tracking views on their handles after they leave (useful when their posts
                are still live). Uncheck to stop pulling their data on future syncs.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>Cancel</Button>
            <Button onClick={() => archiveMutation.mutate({ id: archiveTarget.id, keepSyncing })}
              disabled={archiveMutation.isPending}>
              {archiveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
