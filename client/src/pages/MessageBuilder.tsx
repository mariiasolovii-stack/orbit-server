import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function MessageBuilder() {
  const [activeTab, setActiveTab] = useState<'trial' | 'active'>('trial');
  
  const [trialForm, setTrialForm] = useState({
    weekStart: '',
    weekEnd: '',
    minPosts: 3,
    announcement: '',
    scriptLinks: '',
    resourceLinks: '',
    includeReadCheck: false,
  });

  const [activeForm, setActiveForm] = useState({
    weekStart: '',
    weekEnd: '',
    minPosts: 3,
    announcement: '',
    scriptLinks: '',
    resourceLinks: '',
    includeReadCheck: false,
  });

  const generateTrialMessage = () => {
    const lines = [
      `🎬 **TRIAL CREATOR WEEKLY MESSAGE**`,
      `Week of ${trialForm.weekStart} - ${trialForm.weekEnd}`,
      ``,
      `Hey trial creators! 👋`,
      ``,
      `This week, we're looking for at least **${trialForm.minPosts} posts** from each of you.`,
      ``,
      trialForm.announcement ? `📢 **Announcement:** ${trialForm.announcement}` : '',
      ``,
      `**Script Ideas:**`,
      trialForm.scriptLinks || 'Check the script library for inspiration',
      ``,
      `**Resources:**`,
      trialForm.resourceLinks || 'Refer to our resource guide',
      ``,
      `**Compensation:**`,
      `• $5 per warmup post`,
      `• $20 base rate per video`,
      `• Bonuses at 10k, 25k, 50k, 100k, 250k, 1M, 1.5M, 5M views`,
      ``,
      trialForm.includeReadCheck ? `**Please react with ✅ to confirm you've read this message.**` : '',
    ];
    return lines.filter(line => line !== '').join('\n');
  };

  const generateActiveMessage = () => {
    const lines = [
      `🎬 **ACTIVE CREATOR WEEKLY MESSAGE**`,
      `Week of ${activeForm.weekStart} - ${activeForm.weekEnd}`,
      ``,
      `Hey active creators! 🚀`,
      ``,
      `This week, we're looking for at least **${activeForm.minPosts} posts** from each of you.`,
      ``,
      activeForm.announcement ? `📢 **Announcement:** ${activeForm.announcement}` : '',
      ``,
      `**Script Ideas:**`,
      activeForm.scriptLinks || 'Check the script library for inspiration',
      ``,
      `**Resources:**`,
      activeForm.resourceLinks || 'Refer to our resource guide',
      ``,
      `**Payout Structure:**`,
      `Retroactive tier-based payouts. Get paid the difference when you hit a new tier.`,
      ``,
      activeForm.includeReadCheck ? `**Please react with ✅ to confirm you've read this message.**` : '',
    ];
    return lines.filter(line => line !== '').join('\n');
  };

  const trialMessage = generateTrialMessage();
  const activeMessage = generateActiveMessage();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Message copied to clipboard');
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Morning Message Builder</h1>
          <p className="text-muted-foreground mt-2">Generate Discord messages for your creator channels</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'trial' | 'active')} className="space-y-4">
          <TabsList>
            <TabsTrigger value="trial">Trial Creator Channel</TabsTrigger>
            <TabsTrigger value="active">Active Creator Channel</TabsTrigger>
          </TabsList>

          {/* Trial Creator Message */}
          <TabsContent value="trial" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Trial Creator Message</CardTitle>
                <CardDescription>Generate a weekly message for trial creators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="trial-start">Week Start Date</Label>
                    <Input
                      id="trial-start"
                      type="date"
                      value={trialForm.weekStart}
                      onChange={(e) => setTrialForm({ ...trialForm, weekStart: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="trial-end">Week End Date</Label>
                    <Input
                      id="trial-end"
                      type="date"
                      value={trialForm.weekEnd}
                      onChange={(e) => setTrialForm({ ...trialForm, weekEnd: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="trial-minposts">Minimum Posts This Week</Label>
                  <Input
                    id="trial-minposts"
                    type="number"
                    value={trialForm.minPosts}
                    onChange={(e) => setTrialForm({ ...trialForm, minPosts: parseInt(e.target.value) })}
                  />
                </div>

                <div>
                  <Label htmlFor="trial-announcement">Announcement (Optional)</Label>
                  <Textarea
                    id="trial-announcement"
                    value={trialForm.announcement}
                    onChange={(e) => setTrialForm({ ...trialForm, announcement: e.target.value })}
                    placeholder="Any special announcements for this week?"
                  />
                </div>

                <div>
                  <Label htmlFor="trial-scripts">Script Links (Optional)</Label>
                  <Textarea
                    id="trial-scripts"
                    value={trialForm.scriptLinks}
                    onChange={(e) => setTrialForm({ ...trialForm, scriptLinks: e.target.value })}
                    placeholder="Paste script links or descriptions here"
                    className="min-h-24"
                  />
                </div>

                <div>
                  <Label htmlFor="trial-resources">Resource Links (Optional)</Label>
                  <Textarea
                    id="trial-resources"
                    value={trialForm.resourceLinks}
                    onChange={(e) => setTrialForm({ ...trialForm, resourceLinks: e.target.value })}
                    placeholder="Paste resource links here"
                    className="min-h-24"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="trial-readcheck"
                    checked={trialForm.includeReadCheck}
                    onCheckedChange={(checked) => setTrialForm({ ...trialForm, includeReadCheck: checked as boolean })}
                  />
                  <Label htmlFor="trial-readcheck" className="font-normal cursor-pointer">
                    Include read-check prompt (✅ reaction)
                  </Label>
                </div>
              </CardContent>
            </Card>

            {/* Trial Message Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Message Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gray-50 p-4 rounded border border-gray-200 whitespace-pre-wrap text-sm font-mono">
                  {trialMessage}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleCopy(trialMessage)} className="flex-1">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Message
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Active Creator Message */}
          <TabsContent value="active" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Creator Message</CardTitle>
                <CardDescription>Generate a weekly message for active creators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="active-start">Week Start Date</Label>
                    <Input
                      id="active-start"
                      type="date"
                      value={activeForm.weekStart}
                      onChange={(e) => setActiveForm({ ...activeForm, weekStart: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="active-end">Week End Date</Label>
                    <Input
                      id="active-end"
                      type="date"
                      value={activeForm.weekEnd}
                      onChange={(e) => setActiveForm({ ...activeForm, weekEnd: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="active-minposts">Minimum Posts This Week</Label>
                  <Input
                    id="active-minposts"
                    type="number"
                    value={activeForm.minPosts}
                    onChange={(e) => setActiveForm({ ...activeForm, minPosts: parseInt(e.target.value) })}
                  />
                </div>

                <div>
                  <Label htmlFor="active-announcement">Announcement (Optional)</Label>
                  <Textarea
                    id="active-announcement"
                    value={activeForm.announcement}
                    onChange={(e) => setActiveForm({ ...activeForm, announcement: e.target.value })}
                    placeholder="Any special announcements for this week?"
                  />
                </div>

                <div>
                  <Label htmlFor="active-scripts">Script Links (Optional)</Label>
                  <Textarea
                    id="active-scripts"
                    value={activeForm.scriptLinks}
                    onChange={(e) => setActiveForm({ ...activeForm, scriptLinks: e.target.value })}
                    placeholder="Paste script links or descriptions here"
                    className="min-h-24"
                  />
                </div>

                <div>
                  <Label htmlFor="active-resources">Resource Links (Optional)</Label>
                  <Textarea
                    id="active-resources"
                    value={activeForm.resourceLinks}
                    onChange={(e) => setActiveForm({ ...activeForm, resourceLinks: e.target.value })}
                    placeholder="Paste resource links here"
                    className="min-h-24"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="active-readcheck"
                    checked={activeForm.includeReadCheck}
                    onCheckedChange={(checked) => setActiveForm({ ...activeForm, includeReadCheck: checked as boolean })}
                  />
                  <Label htmlFor="active-readcheck" className="font-normal cursor-pointer">
                    Include read-check prompt (✅ reaction)
                  </Label>
                </div>
              </CardContent>
            </Card>

            {/* Active Message Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Message Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gray-50 p-4 rounded border border-gray-200 whitespace-pre-wrap text-sm font-mono">
                  {activeMessage}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleCopy(activeMessage)} className="flex-1">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Message
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
