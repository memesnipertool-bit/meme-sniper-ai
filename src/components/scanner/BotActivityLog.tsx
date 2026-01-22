import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Ban, 
  Trash2,
  ChevronDown,
  ChevronRight,
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
  const details = entry.details || '';
  const combined = `${msg} ${details}`;
  
  // MOST SPECIFIC patterns first (API-specific errors with fallback context)
  // These capture when a specific service failed but fallback worked
  const errorMappings: [RegExp, string][] = [
    // ===== PUMP.FUN SPECIFIC (most common - Cloudflare blocks) =====
    [/pump\.?fun.*503|503.*pump\.?fun/i, '🟡 Pump.fun overloaded - using backup API'],
    [/pump\.?fun.*530|530.*pump\.?fun/i, '☁️ Pump.fun Cloudflare block - trying backup'],
    [/pump\.?fun.*API.*fail|pump\.?fun.*error/i, '🟡 Pump.fun API busy - using fallbacks'],
    [/pump\.?fun.*cloudflare/i, '☁️ Pump.fun behind Cloudflare - retrying'],
    [/pump\.?fun.*fallback/i, '🔄 Pump.fun unavailable - using backup source'],
    [/still.*on.*pump\.?fun|bonding.*curve.*not.*graduated/i, '🌱 Token still on Pump.fun'],
    [/graduated.*raydium/i, '🎓 Token graduated to Raydium'],
    
    // ===== BIRDEYE SPECIFIC =====
    [/birdeye.*429|birdeye.*rate/i, '⏳ Birdeye rate limited - slowing requests'],
    [/birdeye.*5\d\d|birdeye.*error/i, '🔄 Birdeye busy - using other sources'],
    [/birdeye.*401|birdeye.*key/i, '🔐 Birdeye API key issue'],
    
    // ===== DEXSCREENER SPECIFIC (never show "busy" - always INDEXING) =====
    [/dexscreener.*no.*pair|no.*pairs.*found/i, '⏳ Pool awaiting DexScreener index'],
    [/dexscreener.*429|dexscreener.*rate/i, '⏳ DexScreener indexing pool'],
    [/dexscreener.*5\d\d|dexscreener.*error|dexscreener.*fail/i, '⏳ Pool awaiting DexScreener index'],
    [/dexscreener.*timeout|dexscreener.*abort/i, '⏳ Pool awaiting DexScreener index'],
    [/dexscreener/i, '⏳ Pool awaiting DexScreener index'], // Catch-all for DexScreener
    
    // ===== RAYDIUM SPECIFIC =====
    [/raydium.*5\d\d|raydium.*error/i, '🔄 Raydium API busy - using Jupiter'],
    [/raydium.*pool.*not.*found/i, '🏊 Raydium pool not ready yet'],
    [/Raydium.*found|Raydium V4/i, '✅ Pool found on Raydium'],
    
    // ===== JUPITER SPECIFIC =====
    [/jupiter.*5\d\d|jupiter.*error/i, '🔄 Jupiter busy - will retry'],
    [/not indexed on Jupiter/i, '🔍 Token too new for Jupiter'],
    [/no route|no valid route/i, '🛤️ No swap route yet - pool may be new'],
    [/Jupiter unavailable/i, '🔌 Jupiter offline - using direct DEX'],
    
    // ===== GECKOTERMINAL SPECIFIC =====
    [/gecko.*5\d\d|gecko.*error/i, '🔄 GeckoTerminal busy - using other sources'],
    [/gecko.*429|gecko.*rate/i, '⏳ GeckoTerminal rate limited'],
    
    // ===== TOKEN LIFECYCLE STAGES =====
    [/BONDING|bonding.*curve/i, '🌱 Token on bonding curve'],
    [/LP_LIVE|pool.*live/i, '🏊 Pool live - checking tradability'],
    [/INDEXING|not.*indexed|indexing/i, '⏳ Pool live, awaiting DEX index'],
    [/LISTED|pair.*found/i, '✅ Token listed and verified'],
    
    // ===== SCANNER STAGE SUMMARIES =====
    [/stage.*BONDING/i, '🌱 Scanning bonding curve tokens'],
    [/stage.*LP_LIVE/i, '🏊 Scanning live pools'],
    [/stage.*INDEXING/i, '⏳ Pools waiting for index'],
    [/stage.*LISTED/i, '✅ Listed tokens found'],
    [/\d+ tradeable.*out of/i, '📊 Scan complete'],
    
    // ===== GENERIC FALLBACK MESSAGES (after specific API patterns) =====
    [/using.*fallback|fallback.*endpoint/i, '🔄 Primary API busy - backup working'],
    [/service.*busy.*backup/i, '🔄 Service busy - backup active'],
    [/cloudflare.*protection/i, '☁️ Cloudflare protection - retrying'],
    
    // ===== NETWORK ERRORS =====
    [/dns error|failed to lookup|no address associated/i, '🌐 Network issue - retrying'],
    [/timeout|timed out|aborted/i, '⏱️ Request timed out - retrying'],
    [/fetch failed|failed to fetch/i, '📡 Connection issue - retrying'],
    [/401|unauthorized/i, '🔐 Authentication failed'],
    [/403|forbidden/i, '🚫 Access denied'],
    [/429|rate limit/i, '⏳ Rate limited - slowing down'],
    
    // ===== GENERIC HTTP ERRORS (last resort for HTTP codes) =====
    [/503|service unavailable/i, '🔄 Service temporarily busy - using fallback'],
    [/530/i, '☁️ Cloudflare block - trying fallback'],
    [/HTTP 5\d\d/i, '🔄 API temporarily busy - fallback active'],
    [/HTTP 4\d\d/i, '⚠️ Request error - checking alternatives'],
    
    // ===== LIQUIDITY/POOL MESSAGES =====
    [/insufficient liquidity/i, '💧 Low liquidity - skipped'],
    [/no.*pool.*found/i, '🏊 No pool found yet'],
    [/liquidity.*SOL.*need/i, '💧 Waiting for liquidity'],
    [/DexScreener.*found/i, '✅ Pool found on DexScreener'],
    [/Orca.*found/i, '✅ Pool found on Orca'],
    [/pool.*not.*verified/i, '⚠️ Pool exists but unverified'],
    
    // ===== TRADING MESSAGES =====
    [/slippage|price impact/i, '📉 Price too volatile'],
    [/insufficient.*balance/i, '💰 Need more SOL'],
    [/transaction failed/i, '❌ Transaction failed'],
    [/simulation failed/i, '🧪 Swap simulation failed'],
    [/swap.*verification.*failed/i, '🧪 Swap check failed - may be new token'],
    [/wallet not connected|connect wallet/i, '🔗 Connect wallet to trade'],
    
    // ===== TOKEN EVALUATION =====
    [/discarded|rejected/i, '⏭️ Didn\'t pass filters'],
    [/risk.*high|high.*risk/i, '⚠️ Risk too high'],
    [/honeypot|rug.*pull|scam/i, '🚨 Scam detected - avoided'],
    [/\d+ tokens? evaluated.*0 approved/i, '🔍 Scanning - no matches'],
    [/\d+ token.*approved/i, '✅ Trading opportunity found!'],
    [/evaluating.*\d+.*tokens?/i, '🔎 Evaluating tokens...'],
    
    // ===== SUCCESS MESSAGES =====
    [/tradable|tradeable/i, '✅ Token is tradeable'],
    [/found.*pool|pool.*found/i, '✅ Pool discovered'],
    [/snipe.*success|trade successful/i, '🎯 Trade executed!'],
    [/3-stage snipe/i, '🚀 Starting trade...'],
    [/position closed/i, '💰 Position closed'],
    
    // ===== SYSTEM MESSAGES =====
    [/bot loop started/i, '🤖 Bot is running'],
    [/cleared.*tokens.*cache|cache.*refreshed/i, '🧹 Cache refreshed'],
    [/max positions reached/i, '📊 Position limit reached'],
    [/executing.*trade/i, '⚡ Executing trade...'],
    [/force scan/i, '🔄 Manual scan triggered'],
    [/force evaluate/i, '🔎 Manual evaluation triggered'],
    [/bot reset/i, '🔄 Bot state reset'],
  ];
  
  for (const [pattern, replacement] of errorMappings) {
    if (pattern.test(combined)) {
      return replacement;
    }
  }
  
  // Return original message if no mapping found
  return msg;
}

const INITIAL_DISPLAY_COUNT = 10;
const LOAD_MORE_COUNT = 15;

export default function BotActivityLog({ maxEntries = 100 }: BotActivityLogProps) {
  const logs = useBotLogs();
  const [expanded, setExpanded] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_COUNT);
  
  const allLogs = logs.slice(0, maxEntries);
  const displayLogs = allLogs.slice(0, displayCount);
  const hasMore = displayCount < allLogs.length;
  
  const toggleEntry = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  
  const handleLoadMore = () => {
    setDisplayCount(prev => Math.min(prev + LOAD_MORE_COUNT, allLogs.length));
  };
  
  const stats = {
    success: logs.filter(l => l.level === 'success').length,
    skip: logs.filter(l => l.level === 'skip').length,
    error: logs.filter(l => l.level === 'error').length,
  };

  // Reset display count when logs are cleared
  useEffect(() => {
    if (logs.length === 0) {
      setDisplayCount(INITIAL_DISPLAY_COUNT);
    }
  }, [logs.length]);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className="bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-sm border-border/50 overflow-hidden">
        {/* Decorative accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/20 transition-colors">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="font-semibold">Bot Activity</span>
                <Badge 
                  variant="outline" 
                  className="text-[10px] h-5 px-2 bg-muted/50 border-border/50"
                >
                  {logs.length} logs
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                {/* Stats summary */}
                <div className="flex items-center gap-2 text-[11px] font-medium">
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle className="w-3 h-3" />
                    {stats.success}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Ban className="w-3 h-3" />
                    {stats.skip}
                  </span>
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle className="w-3 h-3" />
                    {stats.error}
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearBotLogs();
                  }}
                  title="Clear all logs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3">
            <ScrollArea className="h-[280px] pr-2">
              {displayLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-10">
                  <div className="p-3 rounded-full bg-muted/30 mb-3">
                    <Activity className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Activate the bot to see logs</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {displayLogs.map((entry, index) => {
                    const config = levelConfig[entry.level];
                    const Icon = config.icon;
                    const isExpanded = expandedEntries.has(entry.id);
                    const friendlyMessage = getFriendlyMessage(entry);
                    
                    return (
                      <div
                        key={entry.id}
                        className={`group p-2.5 rounded-lg border transition-all duration-200 ${
                          entry.details ? 'cursor-pointer hover:border-border' : ''
                        } ${config.bg} border-transparent`}
                        onClick={() => entry.details && toggleEntry(entry.id)}
                        style={{ animationDelay: `${index * 20}ms` }}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`p-1 rounded-md ${config.bg} mt-0.5`}>
                            <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge 
                                variant="outline" 
                                className="text-[9px] h-4 px-1.5 bg-background/50 border-border/50 font-medium"
                              >
                                {categoryLabels[entry.category]}
                              </Badge>
                              {entry.tokenSymbol && (
                                <span className="font-semibold text-xs text-foreground">
                                  ${entry.tokenSymbol}
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                                {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                              {entry.details && (
                                <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              )}
                            </div>
                            <p className={`text-xs leading-relaxed ${config.color} break-words`}>
                              {friendlyMessage}
                            </p>
                            {isExpanded && entry.details && (
                              <div className="mt-2 pt-2 border-t border-border/30 animate-fade-in">
                                <p className="text-[10px] text-muted-foreground break-words whitespace-pre-wrap font-mono bg-background/80 p-2 rounded-md border border-border/30 max-h-32 overflow-y-auto">
                                  {entry.details}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Load More Button */}
                  {hasMore && (
                    <div className="pt-2 pb-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadMore();
                        }}
                      >
                        <ChevronDown className="w-3.5 h-3.5 mr-1.5" />
                        Load more ({allLogs.length - displayCount} remaining)
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
