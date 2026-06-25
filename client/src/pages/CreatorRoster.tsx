import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2, Plus, Edit2, Trash2, CheckCircle, Clock, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function CreatorRoster() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    status: 'trial' as const,
    compType: 'ppp' as const,
    baseRate: 25,
    tiktokHandle: '',
    instagramHandle: '',
  });

  const creatorsQuery = trpc.creators.list.useQuery();
  const createMutation = trpc.creators.create.useMutation({
    onSuccess: () => {
      creatorsQuery.refetch();
      setIsOpen(false);
      setFormData({ name: '', email: '', status: 'trial', compType: 'ppp', baseRate: 25, tiktokHandle: '', instagramHandle: '' });
      toast.success('Creator added successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create creator');
    },
  });

  const updateMutation = trpc.creators.update.useMutation({
    onSuccess: () => {
      creatorsQuery.refetch();
      setIsOpen(false);
      setEditingId(null);
      setFormData({ name: '', email: '', status: 'trial', compType: 'ppp', baseRate: 25, tiktokHandle: '', instagramHandle: '' });
      toast.success('Creator updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update creator');
    },
  });

  const promoteMutation = trpc.creators.promote.useMutation({
    onSuccess: () => {
      creatorsQuery.refetch();
      toast.success('Creator promoted to active');
    },
  });

  const fireMutation = trpc.creators.fire.useMutation({
    onSuccess: () => {
      creatorsQuery.refetch();
      toast.success('Creator fired');
    },
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
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'trial':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'fired':
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
            <h1 className="text-3xl font-bold tracking-tight">Creator Roster</h1>
            <p className="text-muted-foreground mt-2">Manage all creators in your UGC program</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => {
                setEditingId(null);
                setFormData({ name: '', email: '', status: 'trial', compType: 'ppp', baseRate: 25, tiktokHandle: '', instagramHandle: '' });
              }}>
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
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Creator name"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="creator@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ppp">Per-Post</SelectItem>
                      <SelectItem value="retainer">Retainer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="baseRate">Base Rate ($)</Label>
                  <Input
                    id="baseRate"
                    type="number"
                    value={formData.baseRate}
                    onChange={(e) => setFormData({ ...formData, baseRate: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="tiktok">TikTok Handle</Label>
                  <Input
                    id="tiktok"
                    value={formData.tiktokHandle}
                    onChange={(e) => setFormData({ ...formData, tiktokHandle: e.target.value })}
                    placeholder="@handle"
                  />
                </div>
                <div>
                  <Label htmlFor="instagram">Instagram Handle</Label>
                  <Input
                    id="instagram"
                    value={formData.instagramHandle}
                    onChange={(e) => setFormData({ ...formData, instagramHandle: e.target.value })}
                    placeholder="@handle"
                  />
                </div>
                <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  {editingId ? 'Update Creator' : 'Add Creator'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {creatorsQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : creatorsQuery.data && creatorsQuery.data.length > 0 ? (
          <div className="grid gap-4">
            {creatorsQuery.data.map((creator) => (
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
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">{creator.email || 'No email'}</p>
                          <p>{creator.compType === 'ppp' ? 'Per-Post' : 'Retainer'} • ${creator.baseRate}/post</p>
                        </div>
                        <div>
                          {creator.tiktokHandle && <p>TikTok: {creator.tiktokHandle}</p>}
                          {creator.instagramHandle && <p>Instagram: {creator.instagramHandle}</p>}
                        </div>
                      </div>
                      {creator.docusignStatus && (
                        <div className="mt-3">
                          <Badge variant={creator.docusignStatus === 'signed' ? 'default' : 'secondary'}>
                            Contract: {creator.docusignStatus}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {creator.status === 'trial' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => promoteMutation.mutate({ id: creator.id })}
                          disabled={promoteMutation.isPending}
                        >
                          Promote
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(creator)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fireMutation.mutate({ id: creator.id })}
                        disabled={fireMutation.isPending}
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
              <p className="text-muted-foreground">No creators yet. Add your first creator to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
