import { useAppMode } from "@/contexts/AppModeContext";
import { useDemoPortfolio } from "@/contexts/DemoPortfolioContext";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FlaskConical, Radio, RotateCcw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

export default function ModeSwitcher() {
  const { mode, setMode, isLive, isDemo } = useAppMode();
  const { demoBalance, resetDemoPortfolio } = useDemoPortfolio();

  const handleResetDemo = () => {
    resetDemoPortfolio();
    toast.success("Demo portfolio reset to 100 SOL");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-secondary/50 border border-border/50 cursor-pointer hover:bg-secondary/70 transition-colors">
          <div className={`flex items-center gap-1.5 ${!isLive ? 'text-warning' : 'text-muted-foreground'}`}>
            <FlaskConical className="w-3.5 h-3.5" />
            <span className="text-xs font-medium hidden sm:inline">Demo</span>
          </div>
          <Switch
            checked={isLive}
            onCheckedChange={(checked) => setMode(checked ? 'live' : 'demo')}
            className="data-[state=checked]:bg-success data-[state=unchecked]:bg-warning h-5 w-9"
            onClick={(e) => e.stopPropagation()}
          />
          <div className={`flex items-center gap-1.5 ${isLive ? 'text-success' : 'text-muted-foreground'}`}>
            <Radio className="w-3.5 h-3.5" />
            <span className="text-xs font-medium hidden sm:inline">Live</span>
          </div>
          {!isLive && (
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px] px-1.5 py-0 hidden md:flex">
              TEST
            </Badge>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent side="bottom" className="w-64 p-3">
        <div className="space-y-3">
          <div>
            <p className="font-medium text-sm">{isLive ? 'Live Mode' : 'Demo Mode'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isLive 
                ? 'Connected to real APIs and wallet. Trades will execute with real funds.'
                : 'Using simulated data. No real trades will be executed. Perfect for testing strategies.'}
            </p>
          </div>
          
          {isDemo && (
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Demo Balance</span>
                <span className="text-sm font-medium">{demoBalance.toFixed(2)} SOL</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-xs"
                onClick={handleResetDemo}
              >
                <RotateCcw className="w-3 h-3 mr-1.5" />
                Reset to 100 SOL
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
