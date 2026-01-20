import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from "recharts";
import {
  Users,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Ban,
  CheckCircle,
  AlertTriangle,
  Clock,
  Activity,
  DollarSign,
  Eye,
  Search,
  UserX,
  UserCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface UserProfile {
  user_id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "user";
  is_suspended: boolean;
  suspended_at: string | null;
  suspension_reason: string | null;
  created_at: string;
}

interface UserPnLData {
  user_id: string;
  trade_date: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  total_volume: number;
  net_pnl: number;
  avg_pnl_percent: number;
}

interface UserActivity {
  id: string;
  activity_type: string;
  activity_category: string;
  description: string | null;
  message?: string | null;
  metadata: unknown;
  created_at: string;
  severity?: string;
}

interface UserDetailStats {
  totalTrades: number;
  totalVolume: number;
  totalPnL: number;
  winRate: number;
  pnlByDay: UserPnLData[];
  recentActivity: UserActivity[];
}

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
};

export function UserManagementPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userStats, setUserStats] = useState<UserDetailStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, email, display_name, is_suspended, suspended_at, suspension_reason, created_at");

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      const usersWithRoles = (profiles || []).map((profile: any) => ({
        ...profile,
        role: (roles?.find((r: any) => r.user_id === profile.user_id)?.role || "user") as "admin" | "user",
      }));

      setUsers(usersWithRoles);
    } catch (err) {
      console.error("Error fetching users:", err);
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchUserStats = useCallback(async (userId: string) => {
    setLoadingStats(true);
    try {
      // Fetch user positions for P&L
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: positions, error: posError } = await supabase
        .from("positions")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", thirtyDaysAgo.toISOString());

      if (posError) throw posError;

      // Calculate daily P&L
      const pnlByDay: Record<string, UserPnLData> = {};
      let totalTrades = 0;
      let totalVolume = 0;
      let totalPnL = 0;
      let winningTrades = 0;

      (positions || []).forEach((p: any) => {
        const date = new Date(p.created_at).toISOString().split("T")[0];
        if (!pnlByDay[date]) {
          pnlByDay[date] = {
            user_id: userId,
            trade_date: date,
            total_trades: 0,
            winning_trades: 0,
            losing_trades: 0,
            total_volume: 0,
            net_pnl: 0,
            avg_pnl_percent: 0,
          };
        }

        pnlByDay[date].total_trades++;
        pnlByDay[date].total_volume += p.entry_value || 0;
        
        if (p.status === "closed") {
          const pnl = p.profit_loss_value || 0;
          pnlByDay[date].net_pnl += pnl;
          if (pnl > 0) {
            pnlByDay[date].winning_trades++;
            winningTrades++;
          } else if (pnl < 0) {
            pnlByDay[date].losing_trades++;
          }
        }

        totalTrades++;
        totalVolume += p.entry_value || 0;
        totalPnL += p.profit_loss_value || 0;
      });

      // Fetch recent activity logs from user_activity_logs
      const { data: activityLogs } = await supabase
        .from("user_activity_logs" as never)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      // Also fetch trading activity from system_logs
      const { data: systemLogs } = await supabase
        .from("system_logs" as never)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      // Merge and sort both activity sources
      const mergedActivity: UserActivity[] = [
        ...(activityLogs || []).map((log: any) => ({
          id: log.id,
          activity_type: log.activity_type,
          activity_category: log.activity_category,
          description: log.description,
          message: null,
          metadata: log.metadata,
          created_at: log.created_at,
          severity: 'info',
        })),
        ...(systemLogs || []).map((log: any) => ({
          id: log.id,
          activity_type: log.event_type,
          activity_category: log.event_category,
          description: null,
          message: log.message,
          metadata: log.metadata,
          created_at: log.created_at,
          severity: log.severity,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20);

      setUserStats({
        totalTrades,
        totalVolume,
        totalPnL,
        winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
        pnlByDay: Object.values(pnlByDay).sort((a, b) => a.trade_date.localeCompare(b.trade_date)),
        recentActivity: mergedActivity,
      });
    } catch (err) {
      console.error("Error fetching user stats:", err);
      toast.error("Failed to load user statistics");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const updateUserRole = async (userId: string, newRole: "admin" | "user") => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId);

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u))
      );
      toast.success(`User role updated to ${newRole}`);
    } catch (err) {
      console.error("Error updating role:", err);
      toast.error("Failed to update user role");
    }
  };

  const suspendUser = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_suspended: true,
          suspended_at: new Date().toISOString(),
          suspension_reason: suspendReason || "Suspended by admin",
        })
        .eq("user_id", selectedUser.user_id);

      if (error) throw error;

      // Log the activity
      await supabase.from("user_activity_logs" as never).insert({
        user_id: selectedUser.user_id,
        activity_type: "account_suspended",
        activity_category: "admin_action",
        description: `Account suspended: ${suspendReason || "No reason provided"}`,
        metadata: { suspended_by: "admin" },
      } as never);

      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === selectedUser.user_id
            ? { ...u, is_suspended: true, suspended_at: new Date().toISOString(), suspension_reason: suspendReason }
            : u
        )
      );
      setSelectedUser((prev) => prev ? { ...prev, is_suspended: true } : null);
      toast.success("User suspended successfully");
      setShowSuspendDialog(false);
      setSuspendReason("");
    } catch (err) {
      console.error("Error suspending user:", err);
      toast.error("Failed to suspend user");
    } finally {
      setActionLoading(false);
    }
  };

  const unsuspendUser = async (userId: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_suspended: false,
          suspended_at: null,
          suspension_reason: null,
        })
        .eq("user_id", userId);

      if (error) throw error;

      // Log the activity
      await supabase.from("user_activity_logs" as never).insert({
        user_id: userId,
        activity_type: "account_unsuspended",
        activity_category: "admin_action",
        description: "Account reactivated by admin",
        metadata: { unsuspended_by: "admin" },
      } as never);

      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? { ...u, is_suspended: false, suspended_at: null, suspension_reason: null }
            : u
        )
      );
      if (selectedUser?.user_id === userId) {
        setSelectedUser((prev) => prev ? { ...prev, is_suspended: false } : null);
      }
      toast.success("User reactivated successfully");
    } catch (err) {
      console.error("Error unsuspending user:", err);
      toast.error("Failed to reactivate user");
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (selectedUser) {
      fetchUserStats(selectedUser.user_id);
    }
  }, [selectedUser, fetchUserStats]);

  const filteredUsers = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const suspendedCount = users.filter((u) => u.is_suspended).length;
  const activeCount = users.length - suspendedCount;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Users</p>
                <p className="font-semibold text-foreground text-xl">{users.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <UserCheck className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="font-semibold text-foreground text-xl">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <UserX className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Suspended</p>
                <p className="font-semibold text-foreground text-xl">{suspendedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Activity className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Admins</p>
                <p className="font-semibold text-foreground text-xl">
                  {users.filter((u) => u.role === "admin").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* User List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">User Directory</CardTitle>
                <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loadingUsers}>
                  {loadingUsers ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-y-auto space-y-2">
              {loadingUsers ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading users...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No users found</div>
              ) : (
                filteredUsers.map((u) => (
                  <div
                    key={u.user_id}
                    onClick={() => setSelectedUser(u)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedUser?.user_id === u.user_id
                        ? "bg-primary/10 border-primary/30"
                        : "bg-secondary/30 border-border hover:bg-secondary/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          u.is_suspended ? "bg-red-500/20" : "bg-primary/20"
                        }`}
                      >
                        <span className={u.is_suspended ? "text-red-500" : "text-primary"}>
                          {u.email?.[0]?.toUpperCase() || "U"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {u.display_name || u.email}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <Badge
                          variant={u.role === "admin" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {u.role}
                        </Badge>
                        {u.is_suspended && (
                          <Badge variant="destructive" className="text-xs">
                            Suspended
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* User Details */}
        <div className="lg:col-span-3">
          {selectedUser ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${
                        selectedUser.is_suspended ? "bg-red-500/20" : "bg-primary/20"
                      }`}
                    >
                      <span className={selectedUser.is_suspended ? "text-red-500" : "text-primary"}>
                        {selectedUser.email?.[0]?.toUpperCase() || "U"}
                      </span>
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {selectedUser.display_name || selectedUser.email}
                        {selectedUser.is_suspended && (
                          <Badge variant="destructive">Suspended</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{selectedUser.email}</CardDescription>
                      <p className="text-xs text-muted-foreground mt-1">
                        Joined {formatDistanceToNow(new Date(selectedUser.created_at))} ago
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={selectedUser.role}
                      onChange={(e) =>
                        updateUserRole(selectedUser.user_id, e.target.value as "admin" | "user")
                      }
                      className="h-9 px-3 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                    {selectedUser.is_suspended ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unsuspendUser(selectedUser.user_id)}
                        disabled={actionLoading}
                        className="text-green-500 border-green-500/30 hover:bg-green-500/10"
                      >
                        {actionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                        Reactivate
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSuspendDialog(true)}
                        className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                      >
                        <Ban className="w-4 h-4" />
                        Suspend
                      </Button>
                    )}
                  </div>
                </div>

                {selectedUser.is_suspended && selectedUser.suspension_reason && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-500">Suspension Reason</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedUser.suspension_reason}
                        </p>
                        {selectedUser.suspended_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Suspended {formatDistanceToNow(new Date(selectedUser.suspended_at))} ago
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardHeader>

              <CardContent>
                {loadingStats ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    Loading statistics...
                  </div>
                ) : userStats ? (
                  <Tabs defaultValue="pnl" className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="pnl">P&L Analytics</TabsTrigger>
                      <TabsTrigger value="activity">Activity Log</TabsTrigger>
                    </TabsList>

                    <TabsContent value="pnl" className="space-y-4">
                      {/* P&L Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 bg-secondary/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Total Trades</p>
                          <p className="text-lg font-semibold text-foreground">
                            {userStats.totalTrades}
                          </p>
                        </div>
                        <div className="p-3 bg-secondary/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Volume</p>
                          <p className="text-lg font-semibold text-foreground">
                            {formatCurrency(userStats.totalVolume)}
                          </p>
                        </div>
                        <div className="p-3 bg-secondary/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Net P&L</p>
                          <p
                            className={`text-lg font-semibold ${
                              userStats.totalPnL >= 0 ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {userStats.totalPnL >= 0 ? "+" : ""}
                            {formatCurrency(userStats.totalPnL)}
                          </p>
                        </div>
                        <div className="p-3 bg-secondary/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Win Rate</p>
                          <p className="text-lg font-semibold text-foreground">
                            {userStats.winRate.toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      {/* P&L Chart */}
                      {userStats.pnlByDay.length > 0 ? (
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={userStats.pnlByDay}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                              <XAxis
                                dataKey="trade_date"
                                tick={{ fill: "#888", fontSize: 10 }}
                                tickFormatter={(val) => val.slice(5)}
                              />
                              <YAxis
                                tick={{ fill: "#888", fontSize: 10 }}
                                tickFormatter={(val) => `$${val}`}
                              />
                              <Tooltip
                                contentStyle={{ background: "#1a1a1a", border: "1px solid #333" }}
                                formatter={(value: number) => [formatCurrency(value), "P&L"]}
                              />
                              <Bar
                                dataKey="net_pnl"
                                fill="#22c55e"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No trading data in the last 30 days
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="activity" className="space-y-2">
                      {userStats.recentActivity.length > 0 ? (
                        <div className="max-h-[300px] overflow-y-auto space-y-2">
                          {userStats.recentActivity.map((activity) => (
                            <div
                              key={activity.id}
                              className="flex items-start gap-3 p-3 bg-secondary/20 rounded-lg"
                            >
                              <div
                                className={`w-2 h-2 rounded-full mt-2 ${
                                  activity.activity_category === "trading"
                                    ? "bg-primary"
                                    : activity.activity_category === "admin_action"
                                    ? "bg-yellow-500"
                                    : "bg-muted-foreground"
                                }`}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {activity.activity_type}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(activity.created_at))} ago
                                  </span>
                                </div>
                                <p className="text-sm text-foreground mt-1">
                                  {activity.description || activity.message || 'No details'}
                                </p>
                                {activity.severity && activity.severity !== 'info' && (
                                  <Badge 
                                    variant={activity.severity === 'error' ? 'destructive' : 'secondary'}
                                    className="text-xs mt-1"
                                  >
                                    {activity.severity}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No activity logged
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
                <div className="text-center">
                  <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">Select a user to view details</p>
                  <p className="text-sm">Click on a user from the list to see their P&L and activity</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Suspend Dialog */}
      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              Suspend User
            </DialogTitle>
            <DialogDescription>
              This will prevent the user from accessing the platform. They will see a suspension
              notice when trying to log in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Reason for suspension
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => {
                  // Limit suspension reason to 500 characters
                  if (e.target.value.length <= 500) {
                    setSuspendReason(e.target.value);
                  }
                }}
                maxLength={500}
                placeholder="Enter the reason for suspending this user..."
                className="w-full h-24 px-4 py-3 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {suspendReason.length}/500 characters
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuspendDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={suspendUser}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Ban className="w-4 h-4 mr-2" />
              )}
              Suspend User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
