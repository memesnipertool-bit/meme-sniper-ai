import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, XCircle, AlertTriangle, Target, Loader2 } from "lucide-react";

interface SnipeDecision {
  token: {
    address: string;
    symbol: string;
    name: string;
    liquidity: number;
    buyerPosition: number | null;
    riskScore: number;
  };
  approved: boolean;
  reasons: string[];
  tradeParams: {
    amount: number;
    slippage: number;
    priority: string;
  } | null;
}

interface SniperDecisionPanelProps {
  decisions: SnipeDecision[];
  loading: boolean;
  isDemo: boolean;
  botActive: boolean;
}

export default function SniperDecisionPanel({
  decisions,
  loading,
  isDemo,
  botActive,
}: SniperDecisionPanelProps) {
  if (!botActive) {
    return null;
  }

  const approvedCount = decisions.filter(d => d.approved).length;
  const rejectedCount = decisions.filter(d => !d.approved).length;

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Sniper Decisions
            {isDemo && (
              <Badge variant="outline" className="text-[10px] h-4">Demo</Badge>
            )}
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        {decisions.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-success" />
              {approvedCount} approved
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-destructive" />
              {rejectedCount} rejected
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[200px]">
          {decisions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              {loading ? 'Evaluating tokens...' : 'No tokens evaluated yet'}
            </div>
          ) : (
            <div className="space-y-2">
              {decisions.slice(0, 10).map((decision, idx) => (
                <div
                  key={decision.token.address + idx}
                  className={`p-2 rounded-lg border text-xs ${
                    decision.approved
                      ? 'bg-success/10 border-success/30'
                      : 'bg-muted/50 border-border/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {decision.approved ? (
                        <CheckCircle className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      <span className="font-medium">{decision.token.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        ${decision.token.liquidity.toFixed(0)} liq
                      </span>
                      <Badge
                        variant="outline"
                        className={`h-4 text-[9px] ${
                          decision.token.riskScore < 40
                            ? 'border-success/50 text-success'
                            : decision.token.riskScore < 70
                            ? 'border-warning/50 text-warning'
                            : 'border-destructive/50 text-destructive'
                        }`}
                      >
                        Risk {decision.token.riskScore}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-0.5 pl-5">
                    {decision.reasons.slice(0, 5).map((reason, rIdx) => (
                      <div
                        key={rIdx}
                        className={`text-[10px] ${
                          reason.startsWith('✓')
                            ? 'text-success/80'
                            : reason.startsWith('✗')
                            ? 'text-destructive/80'
                            : 'text-warning/80'
                        }`}
                      >
                        {reason}
                      </div>
                    ))}
                  </div>
                  {decision.approved && decision.tradeParams && (
                    <div className="mt-1 pt-1 border-t border-success/20 flex items-center gap-2 pl-5">
                      <span className="text-success text-[10px]">
                        Trade: {decision.tradeParams.amount} SOL @ {decision.tradeParams.slippage}% slip
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
