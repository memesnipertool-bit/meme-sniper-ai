 /**
  * Token Discovery Badge Component
  * Shows age and position eligibility status for sniper targets
  */
 
 import { Badge } from '@/components/ui/badge';
 import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
 import { Clock, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
 import { 
   DISCOVERY_CONFIG, 
   formatTokenAge, 
   isInAgeWindow, 
   isTargetPosition,
   validateDiscoveryCandidate,
   type DiscoveryCandidate,
 } from '@/lib/tokenDiscovery';
 
 interface TokenDiscoveryBadgeProps {
   token: DiscoveryCandidate;
   compact?: boolean;
 }
 
 export function TokenDiscoveryBadge({ token, compact = false }: TokenDiscoveryBadgeProps) {
   const validation = validateDiscoveryCandidate(token);
   const ageValid = isInAgeWindow(token.createdAt);
   const positionValid = isTargetPosition(token.buyerPosition);
   
   const passReasons = validation.reasons.filter(r => r.severity === 'pass');
   const rejectReasons = validation.reasons.filter(r => r.severity === 'reject');
   
   if (compact) {
     return (
       <TooltipProvider>
         <Tooltip>
           <TooltipTrigger asChild>
             <div className="flex items-center gap-1">
               {validation.eligible ? (
                 <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px] px-1.5 py-0">
                   <CheckCircle2 className="w-3 h-3 mr-0.5" />
                   Eligible
                 </Badge>
               ) : (
                 <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] px-1.5 py-0">
                   <AlertTriangle className="w-3 h-3 mr-0.5" />
                   Ineligible
                 </Badge>
               )}
             </div>
           </TooltipTrigger>
           <TooltipContent side="top" className="max-w-xs">
             <div className="text-xs space-y-1">
               {validation.reasons.map((r, i) => (
                 <div key={i} className={r.severity === 'reject' ? 'text-destructive' : 'text-success'}>
                   {r.message}
                 </div>
               ))}
             </div>
           </TooltipContent>
         </Tooltip>
       </TooltipProvider>
     );
   }
 
   return (
     <div className="flex flex-wrap items-center gap-1.5">
       {/* Age Badge */}
       <TooltipProvider>
         <Tooltip>
           <TooltipTrigger asChild>
             <Badge 
               variant="outline" 
               className={`text-[10px] px-1.5 py-0 ${
                 ageValid 
                   ? 'bg-success/10 text-success border-success/30' 
                   : 'bg-orange-500/10 text-orange-400 border-orange-500/30'
               }`}
             >
               <Clock className="w-3 h-3 mr-0.5" />
               {formatTokenAge(token.createdAt)}
             </Badge>
           </TooltipTrigger>
           <TooltipContent side="top">
             <span className="text-xs">
               {ageValid 
                 ? `✅ Within 2min-6hr window` 
                 : `❌ Outside 2min-6hr window`}
             </span>
           </TooltipContent>
         </Tooltip>
       </TooltipProvider>
 
       {/* Position Badge */}
       <TooltipProvider>
         <Tooltip>
           <TooltipTrigger asChild>
             <Badge 
               variant="outline" 
               className={`text-[10px] px-1.5 py-0 ${
                 positionValid 
                   ? 'bg-primary/10 text-primary border-primary/30' 
                   : 'bg-muted text-muted-foreground border-border'
               }`}
             >
               <Target className="w-3 h-3 mr-0.5" />
               #{token.buyerPosition ?? '?'}
             </Badge>
           </TooltipTrigger>
           <TooltipContent side="top">
             <span className="text-xs">
               {positionValid 
                 ? `✅ Target position #2-#6` 
                 : `❌ Outside target range #2-#6`}
             </span>
           </TooltipContent>
         </Tooltip>
       </TooltipProvider>
 
       {/* Overall Status */}
       {validation.eligible ? (
         <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px] px-1.5 py-0">
           <CheckCircle2 className="w-3 h-3 mr-0.5" />
           Ready
         </Badge>
       ) : (
         <TooltipProvider>
           <Tooltip>
             <TooltipTrigger asChild>
               <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] px-1.5 py-0">
                 <AlertTriangle className="w-3 h-3 mr-0.5" />
                 {rejectReasons.length} issue{rejectReasons.length > 1 ? 's' : ''}
               </Badge>
             </TooltipTrigger>
             <TooltipContent side="top" className="max-w-xs">
               <div className="text-xs space-y-0.5">
                 {rejectReasons.map((r, i) => (
                   <div key={i} className="text-destructive">{r.message}</div>
                 ))}
               </div>
             </TooltipContent>
           </Tooltip>
         </TooltipProvider>
       )}
     </div>
   );
 }
 
 /**
  * Discovery Rules Summary - shows current config
  */
 export function DiscoveryRulesSummary() {
   return (
     <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
       <span className="flex items-center gap-1">
         <Clock className="w-3 h-3" />
         2min-6hr
       </span>
       <span className="flex items-center gap-1">
         <Target className="w-3 h-3" />
         #2-#6
       </span>
       <span>
         Min {DISCOVERY_CONFIG.MIN_LIQUIDITY_SOL} SOL
       </span>
     </div>
   );
 }