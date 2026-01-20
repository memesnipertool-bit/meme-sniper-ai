import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Ban, 
  Wallet,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'skip';

export interface BotLogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: 'scan' | 'evaluate' | 'trade' | 'exit' | 'system';
  message: string;
  details?: string;
  tokenSymbol?: string;
  tokenAddress?: string;
}

interface BotActivityLogProps {
  maxEntries?: number;
}

// Global log store (singleton pattern for cross-component access)
let globalLogs: BotLogEntry[] = [];
let logSubscribers: Set<() => void> = new Set();

export function addBotLog(entry: Omit<BotLogEntry, 'id' | 'timestamp'>): void {
  const newEntry: BotLogEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
  };
  
  globalLogs = [newEntry, ...globalLogs].slice(0, 200); // Keep last 200
  logSubscribers.forEach(cb => cb());
}

export function clearBotLogs(): void {
  globalLogs = [];
  logSubscribers.forEach(cb => cb());
}

export function useBotLogs() {
  const [logs, setLogs] = useState<BotLogEntry[]>(globalLogs);
  
  useEffect(() => {
    const update = () => setLogs([...globalLogs]);
    logSubscribers.add(update);
    return () => { logSubscribers.delete(update); };
  }, []);
  
  return logs;
}

const levelConfig: Record<LogLevel, { icon: React.ElementType; color: string; bg: string }> = {
  info: { icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  success: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  error: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
  skip: { icon: Ban, color: 'text-muted-foreground', bg: 'bg-muted/30' },
};

const categoryLabels: Record<string, string> = {
  scan: 'Scan',
  evaluate: 'Eval',
  trade: 'Trade',
  exit: 'Exit',
  system: 'Sys',
};

// Convert technical error messages to user-friendly messages
function getFriendlyMessage(entry: BotLogEntry): string {
  const msg = entry.message;
  
  // Common error patterns -> friendly messages
  const errorMappings: [RegExp, string][] = [
    // Network/API errors
    [/dns error|failed to lookup|no address associated/i, '🌐 Network issue - API temporarily unavailable'],
    [/timeout|timed out|aborted/i, '⏱️ Request timed out - trying again'],
    [/fetch failed|failed to fetch/i, '📡 Connection failed - retrying'],
    [/HTTP 4\d\d|HTTP 5\d\d/i, '⚠️ API error - using fallback'],
    [/401|unauthorized/i, '🔐 Authentication failed'],
    [/403|forbidden/i, '🚫 Access denied'],
    [/429|rate limit/i, '⏳ Rate limited - slowing down'],
    [/503|service unavailable/i, '🔄 Service busy - using backup'],
    [/530|cloudflare/i, '☁️ Cloudflare protection - retrying'],
    
    // Jupiter/DEX errors
    [/not indexed on Jupiter/i, '🔍 Token too new - using Raydium/Orca'],
    [/no route|no valid route/i, '🛤️ No route yet - checking alternatives'],
    [/Jupiter unavailable/i, '🔌 Jupiter offline - using direct DEX'],
    
    // Liquidity/Pool errors
    [/insufficient liquidity/i, '💧 Low liquidity - skipped for safety'],
    [/no.*pool.*found/i, '🏊 No pool found yet'],
    [/liquidity.*SOL.*need/i, '💧 Waiting for more liquidity'],
    [/DexScreener.*found/i, '✅ Pool found via DexScreener'],
    [/Raydium.*found/i, '✅ Pool found on Raydium'],
    [/Orca.*found/i, '✅ Pool found on Orca'],
    
    // Trading errors
    [/slippage|price impact/i, '📉 Price too volatile - skipped'],
    [/insufficient.*balance/i, '💰 Need more SOL in wallet'],
    [/transaction failed/i, '❌ Transaction failed on-chain'],
    [/simulation failed/i, '🧪 Swap simulation failed'],
    [/wallet not connected/i, '🔗 Connect wallet to trade'],
    [/connect wallet/i, '🔗 Connect wallet to enable trading'],
    
    // Token evaluation
    [/discarded|rejected/i, '⏭️ Didn\'t pass filters'],
    [/risk.*high|high.*risk/i, '⚠️ Risk too high - skipped'],
    [/honeypot|rug.*pull/i, '🚨 Scam detected - avoided'],
    [/\d+ tokens evaluated.*0 approved/i, '🔍 Scanning - no matches yet'],
    [/\d+ token.*approved/i, '✅ Found trading opportunity!'],
    
    // Success messages - keep original
    [/tradable|tradeable/i, '✅ Token is tradeable'],
    [/found.*pool|pool.*found/i, '✅ Liquidity pool discovered'],
    [/snipe.*success|trade successful/i, '🎯 Trade executed!'],
    [/3-stage snipe/i, '🚀 Starting trade execution'],
    
    // System messages
    [/bot loop started/i, '🤖 Bot is running'],
    [/cleared.*tokens.*cache/i, '🧹 Cache refreshed'],
    [/max positions reached/i, '📊 Position limit reached'],
    [/executing.*trade/i, '⚡ Executing trade...'],
  ];
  
  for (const [pattern, replacement] of errorMappings) {
    if (pattern.test(msg)) {
      return replacement;
    }
  }
  
  // Return original message if no mapping found
  return msg;
}

export default function BotActivityLog({ maxEntries = 100 }: BotActivityLogProps) {
  const logs = useBotLogs();
  const [expanded, setExpanded] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  
  const displayLogs = logs.slice(0, maxEntries);
  
  const toggleEntry = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  
  const stats = {
    success: logs.filter(l => l.level === 'success').length,
    skip: logs.filter(l => l.level === 'skip').length,
    error: logs.filter(l => l.level === 'error').length,
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Bot Activity
            <Badge variant="outline" className="text-[10px] h-4 ml-1">
              {logs.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-success">{stats.success}✓</span>
              <span className="text-muted-foreground">{stats.skip}⊘</span>
              <span className="text-destructive">{stats.error}✗</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={() => clearBotLogs()}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <ScrollArea className="h-[250px]">
            {displayLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
                No activity yet. Activate the bot to see logs.
              </div>
            ) : (
              <div className="space-y-1.5">
                {displayLogs.map((entry) => {
                  const config = levelConfig[entry.level];
                  const Icon = config.icon;
                  const isExpanded = expandedEntries.has(entry.id);
                  const friendlyMessage = getFriendlyMessage(entry);
                  
                  return (
                    <div
                      key={entry.id}
                      className={`p-2.5 rounded-lg border border-transparent hover:border-border/50 transition-colors ${entry.details ? 'cursor-pointer' : ''} ${config.bg}`}
                      onClick={() => entry.details && toggleEntry(entry.id)}
                    >
                      <div className="flex items-start gap-2">
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">
                              {categoryLabels[entry.category]}
                            </Badge>
                            {entry.tokenSymbol && (
                              <span className="font-semibold text-xs text-foreground shrink-0">
                                ${entry.tokenSymbol}
                              </span>
                            )}
                            <span className="text-[9px] text-muted-foreground shrink-0 ml-auto">
                              {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          <p className={`text-xs leading-relaxed break-words whitespace-pre-wrap ${config.color}`}>
                            {friendlyMessage}
                          </p>
                          {isExpanded && entry.details && (
                            <div className="mt-2 pt-2 border-t border-border/30">
                              <p className="text-[10px] text-muted-foreground break-words whitespace-pre-wrap font-mono bg-background/50 p-2 rounded">
                                {entry.details}
                              </p>
                            </div>
                          )}
                          {entry.details && !isExpanded && (
                            <span className="text-[9px] text-muted-foreground/60 mt-1 inline-block">
                              Click for details...
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}
