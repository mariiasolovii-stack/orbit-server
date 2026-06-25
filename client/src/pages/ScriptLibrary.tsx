import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Trash2, Filter } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ScriptLibrary() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    format: 'talking_head' as const,
    content: '',
  });

  const scriptsQuery = trpc.scripts.list.useQuery();
  const createMutation = trpc.scripts.create.useMutation({
    onSuccess: () => {
      scriptsQuery.refetch();
      setIsOpen(false);
      setFormData({ title: '', format: 'talking_head', content: '' });
      toast.success('Script added successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create script');
    },
  });

  const deleteMutation = trpc.scripts.delete.useMutation({
    onSuccess: () => {
      scriptsQuery.refetch();
      toast.success('Script deleted');
    },
  });

  const handleSubmit = () => {
    if (!formData.title) {
      toast.error('Title is required');
      return;
    }

    createMutation.mutate(formData);
  };

  const formatLabel = (format: string) => {
    const labels: Record<string, string> = {
      talking_head: 'Talking Head',
      non_talking_head: 'Non-Talking Head',
      skit: 'Skit',
      slideshow: 'Slideshow',
    };
    return labels[format] || format;
  };

  const filteredScripts = selectedFormat
    ? scriptsQuery.data?.filter(s => s.format === selectedFormat)
    : scriptsQuery.data;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Script Library</h1>
            <p className="text-muted-foreground mt-2">Manage content scripts for creators</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Script
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Script</DialogTitle>
                <DialogDescription>Create a new content script for creators</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Script title"
                  />
                </div>
                <div>
                  <Label htmlFor="format">Format</Label>
                  <Select value={formData.format} onValueChange={(value: any) => setFormData({ ...formData, format: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="talking_head">Talking Head</SelectItem>
                      <SelectItem value="non_talking_head">Non-Talking Head</SelectItem>
                      <SelectItem value="skit">Skit</SelectItem>
                      <SelectItem value="slideshow">Slideshow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Script content..."
                    className="min-h-48"
                  />
                </div>
                <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Add Script
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Format Filter */}
        <div className="flex gap-2 items-center">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Button
            variant={selectedFormat === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedFormat(null)}
          >
            All Formats
          </Button>
          {['talking_head', 'non_talking_head', 'skit', 'slideshow'].map((format) => (
            <Button
              key={format}
              variant={selectedFormat === format ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFormat(format)}
            >
              {formatLabel(format)}
            </Button>
          ))}
        </div>

        {/* Scripts Grid */}
        {scriptsQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredScripts && filteredScripts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredScripts.map((script) => (
              <Card key={script.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{script.title}</CardTitle>
                      <Badge className="mt-2">{formatLabel(script.format)}</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteMutation.mutate({ id: script.id })}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-sm text-muted-foreground line-clamp-4">
                    {script.content || 'No content'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                {selectedFormat ? 'No scripts in this format' : 'No scripts yet. Add your first script to get started.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
