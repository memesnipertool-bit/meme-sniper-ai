import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, Bot, AlertTriangle, CheckCircle, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useNotifications, Notification } from "@/hooks/useNotifications";

const activityIcons = {
  trade: TrendingUp,
  warning: AlertTriangle,
  error: AlertTriangle,
  success: CheckCircle,
  info: Bell,
};

const activityColors = {
  success: "bg-success/20 text-success border-success/30",
  warning: "bg-warning/20 text-warning border-warning/30",
  error: "bg-destructive/20 text-destructive border-destructive/30",
  info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  trade: "bg-primary/20 text-primary border-primary/30",
};

export default function RecentActivity() {
  const { notifications } = useNotifications();
  
  // Get the 5 most recent notifications
  const recentNotifications = notifications.slice(0, 5);

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-xl">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl" />
      </div>
      
      <CardHeader className="relative pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/10">
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            <p className="text-xs text-muted-foreground">Your latest actions</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="relative pt-0">
        {recentNotifications.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
            <p className="text-xs text-muted-foreground/70">Actions will appear here as you trade</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentNotifications.map((notification, index) => {
              const Icon = activityIcons[notification.type] || Bell;
              const colorClass = activityColors[notification.type] || activityColors.info;
              const pnl = notification.metadata?.pnl as number | undefined;
              
              return (
                <div
                  key={notification.id}
                  className="group flex items-start gap-3 p-3 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all duration-200 animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className={cn("p-2 rounded-lg border shrink-0", colorClass)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{notification.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{notification.message}</p>
                      </div>
                      {pnl !== undefined && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "shrink-0 text-[10px] px-1.5",
                            pnl >= 0 
                              ? "bg-success/10 text-success border-success/30" 
                              : "bg-destructive/10 text-destructive border-destructive/30"
                          )}
                        >
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
