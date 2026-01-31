/**
 * Position Status Badge Component
 * Displays visual indicators for position statuses and trade warnings
 */

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Droplets,
  XCircle,
  RefreshCw,
  TrendingDown,
  HelpCircle,
} from 'lucide-react';
import type { PositionStatus, TradeWarning } from '@/lib/tradeSafety';

interface PositionStatusBadgeProps {
  status: string;
  className?: string;
  showTooltip?: boolean;
}

const STATUS_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  className: string;
  description: string;
}> = {
  open: {
    label: 'Open',
    icon: CheckCircle,
    className: 'bg-success/20 text-success border-success/30',
    description: 'Position is active and being monitored',
  },
  closed: {
    label: 'Closed',
    icon: CheckCircle,
    className: 'bg-muted/50 text-muted-foreground border-muted',
    description: 'Position has been closed',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-warning/20 text-warning border-warning/30 animate-pulse',
    description: 'Transaction is being confirmed on-chain',
  },
  waiting_for_liquidity: {
    label: 'Illiquid',
    icon: Droplets,
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    description: 'No swap route available. Waiting for liquidity to appear.',
  },
  swap_failed: {
    label: 'Swap Failed',
    icon: XCircle,
    className: 'bg-destructive/20 text-destructive border-destructive/30',
    description: 'Swap transaction failed. Tokens are still in your wallet.',
  },
};

export const PositionStatusBadge = memo(({
  status,
  className,
  showTooltip = true,
}: PositionStatusBadgeProps) => {
  const config = STATUS_CONFIG[status] || {
    label: status,
    icon: HelpCircle,
    className: 'bg-muted/50 text-muted-foreground border-muted',
    description: 'Unknown status',
  };
  
  const Icon = config.icon;
  
  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'text-xs font-medium gap-1 px-2 py-0.5',
        config.className,
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
  
  if (!showTooltip) {
    return badge;
  }
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent className="bg-popover border-border max-w-xs">
        <p className="text-xs">{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
});

PositionStatusBadge.displayName = 'PositionStatusBadge';

// Trade Warning Badge for pre-buy/sell warnings
interface TradeWarningBadgeProps {
  warning: TradeWarning;
  className?: string;
}

const WARNING_ICONS: Record<string, React.ElementType> = {
  illiquid: Droplets,
  honeypot_suspected: AlertTriangle,
  slippage_retry: RefreshCw,
  high_impact: TrendingDown,
  low_liquidity: Droplets,
};

const WARNING_STYLES: Record<string, string> = {
  illiquid: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  honeypot_suspected: 'bg-red-500/20 text-red-400 border-red-500/30',
  slippage_retry: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 animate-pulse',
  high_impact: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low_liquidity: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

export const TradeWarningBadge = memo(({
  warning,
  className,
}: TradeWarningBadgeProps) => {
  const Icon = WARNING_ICONS[warning.type] || AlertTriangle;
  const style = WARNING_STYLES[warning.type] || 'bg-muted/50 text-muted-foreground';
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            'text-xs font-medium gap-1 px-2 py-0.5',
            style,
            className
          )}
        >
          <Icon className="w-3 h-3" />
          {warning.type === 'honeypot_suspected' ? 'Honeypot?' : 
           warning.type === 'slippage_retry' ? 'Retrying...' :
           warning.type === 'high_impact' ? 'High Impact' :
           warning.type === 'low_liquidity' ? 'Low Liquidity' :
           'Illiquid'}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="bg-popover border-border max-w-xs">
        <p className="text-xs">{warning.message}</p>
      </TooltipContent>
    </Tooltip>
  );
});

TradeWarningBadge.displayName = 'TradeWarningBadge';

// Combined warning list component
interface TradeWarningsProps {
  warnings: TradeWarning[];
  className?: string;
}

export const TradeWarnings = memo(({ warnings, className }: TradeWarningsProps) => {
  if (warnings.length === 0) return null;
  
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {warnings.map((warning, index) => (
        <TradeWarningBadge key={`${warning.type}-${index}`} warning={warning} />
      ))}
    </div>
  );
});

TradeWarnings.displayName = 'TradeWarnings';

export default PositionStatusBadge;
