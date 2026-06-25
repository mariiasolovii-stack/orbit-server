import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, DollarSign } from "lucide-react";

export default function PayoutQueue() {
  const creatorsQuery = trpc.creators.list.useQuery();
  const payoutsQuery = trpc.payouts.calculatePending.useQuery();
  const payoutHistoryQuery = trpc.payouts.list.useQuery();

  const getCreatorName = (creatorId: string | null) => {
    if (!creatorId) return 'Unknown';
    return creatorsQuery.data?.find(c => c.id === creatorId)?.name || 'Unknown';
  };

  const getCreatorStatus = (creatorId: string | null) => {
    if (!creatorId) return 'unknown';
    return creatorsQuery.data?.find(c => c.id === creatorId)?.status || 'unknown';
  };

  const isLoading = creatorsQuery.isLoading || payoutsQuery.isLoading || payoutHistoryQuery.isLoading;

  const totalOwed = payoutsQuery.data ? Object.values(payoutsQuery.data).reduce((sum, amount) => sum + amount, 0) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payout Queue</h1>
          <p className="text-muted-foreground mt-2">Manage creator payouts and view history</p>
        </div>

        {/* Summary Card */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Current Cycle Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${totalOwed.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground mt-2">
              Total owed to {Object.keys(payoutsQuery.data || {}).length} creators
            </p>
          </CardContent>
        </Card>

        {/* Current Payouts */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Payouts Owed</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : payoutsQuery.data && Object.keys(payoutsQuery.data).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(payoutsQuery.data)
                .sort(([, a], [, b]) => b - a)
                .map(([creatorId, amount]) => (
                  <Card key={creatorId}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{getCreatorName(creatorId)}</h3>
                          <Badge variant="outline" className="mt-2">
                            {getCreatorStatus(creatorId)}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">${amount.toLocaleString()}</p>
                          <Button size="sm" className="mt-2">
                            Mark Paid
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
                <p className="text-muted-foreground">No payouts owed at this time</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Payout History */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Payout History</h2>
          {payoutHistoryQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : payoutHistoryQuery.data && payoutHistoryQuery.data.length > 0 ? (
            <div className="space-y-3">
              {payoutHistoryQuery.data.map((payout) => (
                <Card key={payout.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{getCreatorName(payout.creatorId)}</h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(payout.payoutDate).toLocaleDateString()} • {payout.payoutType}
                        </p>
                      </div>
                      <p className="text-lg font-semibold">${payout.amount.toLocaleString()}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">No payout history yet</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
