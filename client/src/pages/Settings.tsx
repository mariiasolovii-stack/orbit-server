import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function Settings() {
  const settingsQuery = trpc.settings.list.useQuery();
  const getSetting = trpc.settings.get.useQuery;
  const upsertMutation = trpc.settings.upsert.useMutation({
    onSuccess: () => {
      settingsQuery.refetch();
      toast.success('Setting saved');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save setting');
    },
  });

  const [trackrApiKey, setTrackrApiKey] = useState('');
  const [payoutTiers, setPayoutTiers] = useState<Array<{ views: number; amount: number }>>([
    { views: 1000, amount: 25 },
    { views: 10000, amount: 30 },
    { views: 100000, amount: 75 },
    { views: 500000, amount: 200 },
    { views: 1000000, amount: 500 },
  ]);

  useEffect(() => {
    if (settingsQuery.data) {
      const trackrKey = settingsQuery.data.find(s => s.key === 'trackr_api_key');
      if (trackrKey?.value) {
        setTrackrApiKey(trackrKey.value);
      }

      const tiersKey = settingsQuery.data.find(s => s.key === 'payout_tiers');
      if (tiersKey?.value) {
        try {
          setPayoutTiers(JSON.parse(tiersKey.value));
        } catch (e) {
          // Use default tiers
        }
      }
    }
  }, [settingsQuery.data]);

  const handleSaveTrackrKey = () => {
    if (!trackrApiKey) {
      toast.error('API key cannot be empty');
      return;
    }
    upsertMutation.mutate({ key: 'trackr_api_key', value: trackrApiKey });
  };

  const handleSavePayoutTiers = () => {
    upsertMutation.mutate({ key: 'payout_tiers', value: JSON.stringify(payoutTiers) });
  };

  const updateTier = (index: number, field: 'views' | 'amount', value: number) => {
    const newTiers = [...payoutTiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setPayoutTiers(newTiers);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">Configure your UGC program</p>
        </div>

        <Tabs defaultValue="trackr" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trackr">Trackr API</TabsTrigger>
            <TabsTrigger value="payouts">Payout Tiers</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          {/* Trackr API Settings */}
          <TabsContent value="trackr">
            <Card>
              <CardHeader>
                <CardTitle>UGCTrackr API Configuration</CardTitle>
                <CardDescription>
                  Configure your Trackr API key to enable post view syncing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="trackrKey">API Key</Label>
                  <Input
                    id="trackrKey"
                    type="password"
                    value={trackrApiKey}
                    onChange={(e) => setTrackrApiKey(e.target.value)}
                    placeholder="Enter your Trackr API key"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Get your API key from{' '}
                    <a href="https://app.ugctrackr.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      UGCTrackr Dashboard
                    </a>
                  </p>
                </div>
                <Button onClick={handleSaveTrackrKey} disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save API Key
                </Button>
                <p className="text-xs text-muted-foreground border-t pt-3">
                  Note: For security, the active API key is stored as a server-side
                  environment variable (<code>TRACKR_API_KEY</code>) and is never exposed to the
                  browser. The sync always runs through a server proxy.
                </p>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle>How Trackr Sync Works</CardTitle>
                <CardDescription>
                  What happens each time you click “Sync Trackr Posts”
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  The sync pulls every post in your Trackr campaign and reconciles it with your
                  roster. Specifically:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <span className="text-foreground font-medium">Existing posts</span> have their
                    view counts and engagement (likes, comments, shares, saves) updated. Nothing is
                    duplicated — posts are matched by their Trackr ID / link.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">New creators</span> found in Trackr
                    are auto-added to your roster as <span className="font-medium">trial</span> so you
                    can re-tag them. Handles are matched by username (the leading “@” is ignored, so
                    you can type handles either way).
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Fired creators</span> who are still
                    on the roster keep syncing, so you can track the views their handles continue to
                    earn while being phased out.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Archived creators with syncing
                    turned off</span> are skipped entirely — this keeps old, inactive profiles that
                    still live in Trackr from cluttering your active roster, while their historical
                    data is preserved.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payout Tiers */}
          <TabsContent value="payouts">
            <Card>
              <CardHeader>
                <CardTitle>Payout Bonus Tiers</CardTitle>
                <CardDescription>
                  View thresholds and bonus amounts that apply on top of the $20 base per video
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  Every creator earns a <span className="text-foreground font-medium">$20 base per
                  qualifying video</span> (300+ views). The tiers below are the{" "}
                  <span className="text-foreground font-medium">bonuses</span> added on top, applied
                  retroactively (only the difference is paid when a post reaches a higher tier).
                  These rules are the same for trial and active creators.
                </div>
                <div className="space-y-3">
                  {payoutTiers.map((tier, index) => (
                    <div key={index} className="flex gap-4 items-end">
                      <div className="flex-1">
                        <Label htmlFor={`views-${index}`} className="text-xs">Views</Label>
                        <Input
                          id={`views-${index}`}
                          type="number"
                          value={tier.views}
                          onChange={(e) => updateTier(index, 'views', parseInt(e.target.value))}
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={`amount-${index}`} className="text-xs">Amount ($)</Label>
                        <Input
                          id={`amount-${index}`}
                          type="number"
                          value={tier.amount}
                          onChange={(e) => updateTier(index, 'amount', parseInt(e.target.value))}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPayoutTiers(payoutTiers.filter((_, i) => i !== index))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => setPayoutTiers([...payoutTiers, { views: 0, amount: 0 }])}
                  className="w-full"
                >
                  Add Tier
                </Button>
                <Button onClick={handleSavePayoutTiers} disabled={upsertMutation.isPending} className="w-full">
                  {upsertMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save Tiers
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* General Settings */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>
                  Program-wide configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="minViews">Minimum Views to Qualify</Label>
                  <Input
                    id="minViews"
                    type="number"
                    defaultValue={300}
                    placeholder="300"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Posts must have at least this many views to qualify for payout
                  </p>
                </div>
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-sm font-medium">Trial period</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    There is no fixed trial length. Trial creators stay in trial and are paid on the same
                    payout tiers as active creators until you manually re-tag them as "Active" on the Creator
                    Roster. There's nothing to configure here.
                  </p>
                </div>
                <div>
                  <Label htmlFor="trialGoal">Trial View Milestone (display only)</Label>
                  <Input
                    id="trialGoal"
                    type="number"
                    defaultValue={10000}
                    placeholder="10000"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    The view milestone shown on the Overview trial progress bars (does not affect pay).
                  </p>
                </div>
                <Button disabled>Save Settings</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
