import React, { forwardRef, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  Check,
  Trash2,
  TrendingUp,
  AlertTriangle,
  Info,
  CheckCircle,
  X,
  Settings,
  Filter,
} from "lucide-react";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

const notificationIcons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: X,
  trade: TrendingUp,
};

const notificationColors = {
  info: "text-blue-400 bg-blue-500/20 border-blue-500/30",
  success: "text-success bg-success/20 border-success/30",
  warning: "text-warning bg-warning/20 border-warning/30",
  error: "text-destructive bg-destructive/20 border-destructive/30",
  trade: "text-primary bg-primary/20 border-primary/30",
};

const notificationLabels = {
  info: "Info",
  success: "Success",
  warning: "Warning",
  error: "Error",
  trade: "Trade",
};

const Notifications = forwardRef<HTMLDivElement, object>(function Notifications(_props, ref) {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();

  const [filter, setFilter] = useState<string>("all");

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read;
    return n.type === filter;
  });

  const groupedByDate = filteredNotifications.reduce((acc, notification) => {
    const date = format(new Date(notification.created_at), "yyyy-MM-dd");
    const label = format(new Date(notification.created_at), "MMMM d, yyyy");
    if (!acc[date]) {
      acc[date] = { label, notifications: [] };
    }
    acc[date].notifications.push(notification);
    return acc;
  }, {} as Record<string, { label: string; notifications: Notification[] }>);

  return (
    <AppLayout>
      <div className="container mx-auto max-w-4xl px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread notifications` : "All caught up!"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAll}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                Clear all
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <Tabs value={filter} onValueChange={setFilter} className="space-y-6">
          <TabsList className="bg-secondary/40 backdrop-blur-xl border border-border/50 p-1 rounded-xl">
            <TabsTrigger value="all" className="rounded-lg">
              All
            </TabsTrigger>
            <TabsTrigger value="unread" className="rounded-lg">
              Unread
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="trade" className="rounded-lg">
              Trades
            </TabsTrigger>
            <TabsTrigger value="warning" className="rounded-lg">
              Alerts
            </TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="mt-0">
            {filteredNotifications.length === 0 ? (
              <Card className="border-0 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-xl">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="p-4 rounded-2xl bg-secondary/50 mb-4">
                    <Bell className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium text-muted-foreground">
                    No notifications
                  </p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    {filter === "unread"
                      ? "You've read all your notifications"
                      : "You'll see updates here when something happens"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedByDate).map(([date, { label, notifications: dateNotifications }]) => (
                  <div key={date}>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
                      {label}
                    </h3>
                    <Card className="border-0 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-xl overflow-hidden">
                      <div className="divide-y divide-border/50">
                        {dateNotifications.map((notification) => {
                          const Icon = notificationIcons[notification.type];
                          const colorClass = notificationColors[notification.type];

                          return (
                            <div
                              key={notification.id}
                              className={cn(
                                "group relative p-4 transition-all duration-200 hover:bg-secondary/30",
                                !notification.read && "bg-primary/5"
                              )}
                            >
                              <div className="flex gap-4">
                                <div className={cn("p-2.5 rounded-xl border shrink-0 h-fit", colorClass)}>
                                  <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <p
                                          className={cn(
                                            "font-semibold",
                                            !notification.read && "text-foreground",
                                            notification.read && "text-muted-foreground"
                                          )}
                                        >
                                          {notification.title}
                                        </p>
                                        <Badge
                                          variant="outline"
                                          className={cn("text-[10px] px-1.5 py-0", colorClass)}
                                        >
                                          {notificationLabels[notification.type]}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {notification.message}
                                      </p>
                                      <p className="text-xs text-muted-foreground/70 mt-2">
                                        {formatDistanceToNow(new Date(notification.created_at), {
                                          addSuffix: true,
                                        })}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {!notification.read && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => markAsRead(notification.id)}
                                        >
                                          <Check className="w-4 h-4" />
                                        </Button>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        onClick={() => deleteNotification(notification.id)}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                                {!notification.read && (
                                  <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
});

Notifications.displayName = 'Notifications';

export default Notifications;
