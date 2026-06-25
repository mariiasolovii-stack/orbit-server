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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payout Tiers */}
          <TabsContent value="payouts">
            <Card>
              <CardHeader>
                <CardTitle>Payout Tiers</CardTitle>
                <CardDescription>
                  Define view thresholds and corresponding payout amounts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                    </div>
                  ))}
                </div>
                <Button onClick={handleSavePayoutTiers} disabled={upsertMutation.isPending}>
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
                <div>
                  <Label htmlFor="trialDays">Trial Period (Days)</Label>
                  <Input
                    id="trialDays"
                    type="number"
                    defaultValue={14}
                    placeholder="14"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    How long creators stay in trial before promotion
                  </p>
                </div>
                <div>
                  <Label htmlFor="trialGoal">Trial View Goal</Label>
                  <Input
                    id="trialGoal"
                    type="number"
                    defaultValue={10000}
                    placeholder="10000"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    View count needed to qualify for trial bonus
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
