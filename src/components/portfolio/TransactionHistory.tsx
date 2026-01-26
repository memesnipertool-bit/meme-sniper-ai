import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  History,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Filter,
  CalendarIcon,
  Download,
  FileText,
  FileSpreadsheet,
  FileJson,
  Search,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, subDays, subWeeks, subMonths, subYears, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { TradeHistoryEntry } from '@/hooks/useTradeHistory';
import { isPlaceholderTokenText } from '@/lib/dexscreener';
import { useDisplayUnit } from '@/contexts/DisplayUnitContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TransactionHistoryProps {
  trades: TradeHistoryEntry[];
  loading: boolean;
  onRefetch: () => void;
}

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';
type TradeTypeFilter = 'all' | 'buy' | 'sell';
type StatusFilter = 'all' | 'completed' | 'pending' | 'failed';

const shortAddress = (address: string) =>
  address && address.length > 10
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : address || 'Token';

export function TransactionHistory({ trades, loading, onRefetch }: TransactionHistoryProps) {
  const { formatPrimaryValue, formatDualValue } = useDisplayUnit();
  const [exporting, setExporting] = useState(false);
  
  // Filter states
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [tradeTypeFilter, setTradeTypeFilter] = useState<TradeTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Calculate date range based on preset
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: startOfDay(subWeeks(now, 1)), end: endOfDay(now) };
      case 'month':
        return { start: startOfDay(subMonths(now, 1)), end: endOfDay(now) };
      case 'year':
        return { start: startOfDay(subYears(now, 1)), end: endOfDay(now) };
      case 'custom':
        return { 
          start: customStartDate ? startOfDay(customStartDate) : undefined, 
          end: customEndDate ? endOfDay(customEndDate) : undefined 
        };
      default:
        return { start: undefined, end: undefined };
    }
  }, [datePreset, customStartDate, customEndDate]);

  // Filter trades
  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
      // Date filter
      if (dateRange.start && isBefore(new Date(trade.created_at), dateRange.start)) return false;
      if (dateRange.end && isAfter(new Date(trade.created_at), dateRange.end)) return false;
      
      // Trade type filter
      if (tradeTypeFilter !== 'all' && trade.trade_type !== tradeTypeFilter) return false;
      
      // Status filter
      if (statusFilter !== 'all' && trade.status !== statusFilter) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const symbol = trade.token_symbol?.toLowerCase() || '';
        const name = trade.token_name?.toLowerCase() || '';
        const address = trade.token_address.toLowerCase();
        const txHash = trade.tx_hash?.toLowerCase() || '';
        
        if (!symbol.includes(query) && !name.includes(query) && !address.includes(query) && !txHash.includes(query)) {
          return false;
        }
      }
      
      return true;
    });
  }, [trades, dateRange, tradeTypeFilter, statusFilter, searchQuery]);

  // Stats for filtered trades
  const stats = useMemo(() => {
    const buys = filteredTrades.filter(t => t.trade_type === 'buy');
    const sells = filteredTrades.filter(t => t.trade_type === 'sell');
    const completed = filteredTrades.filter(t => t.status === 'completed');
    const totalVolumeSol = filteredTrades.reduce((sum, t) => sum + (t.price_sol || 0), 0);
    
    return {
      total: filteredTrades.length,
      buys: buys.length,
      sells: sells.length,
      completed: completed.length,
      totalVolumeSol,
    };
  }, [filteredTrades]);

  // Export functions
  const exportToCSV = () => {
    if (filteredTrades.length === 0) {
      toast.error('No transactions to export');
      return;
    }

    setExporting(true);
    try {
      const headers = ['Date', 'Type', 'Token Symbol', 'Token Name', 'Token Address', 'Amount', 'Price (SOL)', 'Price (USD)', 'Status', 'TX Hash'];
      const rows = filteredTrades.map(trade => [
        format(new Date(trade.created_at), 'yyyy-MM-dd HH:mm:ss'),
        trade.trade_type.toUpperCase(),
        trade.token_symbol || 'Unknown',
        trade.token_name || 'Unknown',
        trade.token_address,
        trade.amount.toFixed(6),
        trade.price_sol?.toFixed(8) || '',
        trade.price_usd?.toFixed(4) || '',
        trade.status || 'pending',
        trade.tx_hash || '',
      ]);

      const escapeCSV = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => escapeCSV(String(cell))).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('CSV exported successfully');
    } catch (error) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const exportToJSON = () => {
    if (filteredTrades.length === 0) {
      toast.error('No transactions to export');
      return;
    }

    setExporting(true);
    try {
      const jsonContent = JSON.stringify(filteredTrades, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `transactions_${format(new Date(), 'yyyy-MM-dd')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('JSON exported successfully');
    } catch (error) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = () => {
    if (filteredTrades.length === 0) {
      toast.error('No transactions to export');
      return;
    }

    setExporting(true);
    try {
      const totalVolume = stats.totalVolumeSol;
      const reportDate = format(new Date(), 'MMMM dd, yyyy HH:mm');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Transaction History Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: white; color: #1a1a1a; }
            .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e5e5; }
            h1 { margin: 0 0 10px; color: #111; }
            .date { color: #666; font-size: 14px; }
            .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
            .stat-card { background: #f9f9f9; padding: 15px; border-radius: 8px; text-align: center; }
            .stat-value { font-size: 24px; font-weight: bold; color: #111; }
            .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
            .buy { color: #22c55e; }
            .sell { color: #ef4444; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #e5e5e5; }
            th { background: #f5f5f5; font-weight: 600; }
            tr:hover { background: #fafafa; }
            .status-completed { color: #22c55e; }
            .status-failed { color: #ef4444; }
            .status-pending { color: #f59e0b; }
            @media print { body { padding: 0; } .summary { page-break-inside: avoid; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Transaction History Report</h1>
            <div class="date">Generated on ${reportDate}</div>
          </div>
          
          <div class="summary">
            <div class="stat-card">
              <div class="stat-value">${stats.total}</div>
              <div class="stat-label">Total Transactions</div>
            </div>
            <div class="stat-card">
              <div class="stat-value buy">${stats.buys}</div>
              <div class="stat-label">Buy Orders</div>
            </div>
            <div class="stat-card">
              <div class="stat-value sell">${stats.sells}</div>
              <div class="stat-label">Sell Orders</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${totalVolume.toFixed(4)} SOL</div>
              <div class="stat-label">Total Volume</div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Token</th>
                <th>Amount</th>
                <th>Price (SOL)</th>
                <th>Price (USD)</th>
                <th>Status</th>
                <th>TX Hash</th>
              </tr>
            </thead>
            <tbody>
              ${filteredTrades.map(trade => `
                <tr>
                  <td>${format(new Date(trade.created_at), 'MM/dd/yy HH:mm')}</td>
                  <td class="${trade.trade_type}">${trade.trade_type.toUpperCase()}</td>
                  <td><strong>${!isPlaceholderTokenText(trade.token_symbol) ? trade.token_symbol : shortAddress(trade.token_address)}</strong></td>
                  <td>${trade.amount.toFixed(4)}</td>
                  <td>${trade.price_sol?.toFixed(6) || '-'}</td>
                  <td>${trade.price_usd ? '$' + trade.price_usd.toFixed(4) : '-'}</td>
                  <td class="status-${trade.status || 'pending'}">${trade.status || 'pending'}</td>
                  <td>${trade.tx_hash ? shortAddress(trade.tx_hash) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 250);
      }

      toast.success('PDF report opened for printing');
    } catch (error) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setDatePreset('all');
    setCustomStartDate(undefined);
    setCustomEndDate(undefined);
    setTradeTypeFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters = datePreset !== 'all' || tradeTypeFilter !== 'all' || statusFilter !== 'all' || searchQuery !== '';

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Transaction History
              <Badge variant="secondary" className="ml-2">{stats.total}</Badge>
            </CardTitle>
            
            <div className="flex items-center gap-2">
              {/* Export dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={exporting || filteredTrades.length === 0}>
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span className="hidden sm:inline ml-2">Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border-border z-50">
                  <DropdownMenuItem onClick={exportToCSV}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToPDF}>
                    <FileText className="w-4 h-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToJSON}>
                    <FileJson className="w-4 h-4 mr-2" />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Filter toggle */}
              <Button
                variant={showFilters ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline ml-2">Filters</span>
                {hasActiveFilters && (
                  <Badge variant="default" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    !
                  </Badge>
                )}
              </Button>

              {/* Refresh */}
              <Button variant="outline" size="sm" onClick={onRefetch} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-secondary/30 rounded-lg border border-border">
              {/* Search */}
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search token, address, or tx..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Date Preset */}
              <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                <SelectTrigger>
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="year">Last Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {/* Trade Type */}
              <Select value={tradeTypeFilter} onValueChange={(v) => setTradeTypeFilter(v as TradeTypeFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Trade Type" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="buy">Buy Only</SelectItem>
                  <SelectItem value="sell">Sell Only</SelectItem>
                </SelectContent>
              </Select>

              {/* Status */}
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              {/* Custom Date Range */}
              {datePreset === 'custom' && (
                <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap gap-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("justify-start text-left font-normal", !customStartDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customStartDate ? format(customStartDate, 'PPP') : 'Start Date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-card border-border z-50" align="start">
                      <Calendar
                        mode="single"
                        selected={customStartDate}
                        onSelect={setCustomStartDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("justify-start text-left font-normal", !customEndDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customEndDate ? format(customEndDate, 'PPP') : 'End Date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-card border-border z-50" align="start">
                      <Calendar
                        mode="single"
                        selected={customEndDate}
                        onSelect={setCustomEndDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Clear Filters */}
              {hasActiveFilters && (
                <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="w-4 h-4 mr-2" />
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Quick Stats */}
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
              {stats.buys} Buys
            </Badge>
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
              {stats.sells} Sells
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              Volume: {stats.totalVolumeSol.toFixed(4)} SOL
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading && trades.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="p-12 text-center">
            <History className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {trades.length === 0 ? 'No transactions yet' : 'No transactions match your filters'}
            </p>
            <p className="text-sm text-muted-foreground">
              {trades.length === 0 
                ? 'Your buy and sell transactions will appear here'
                : 'Try adjusting your filter criteria'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">TX</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrades.map((trade) => (
                  <TableRow key={trade.id} className="hover:bg-secondary/30">
                    <TableCell className="whitespace-nowrap">
                      <div className="text-sm">{format(new Date(trade.created_at), 'MMM d, yyyy')}</div>
                      <div className="text-xs text-muted-foreground">{format(new Date(trade.created_at), 'HH:mm:ss')}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${trade.trade_type === 'buy' ? 'bg-success/20' : 'bg-destructive/20'}`}>
                          {trade.trade_type === 'buy' ? (
                            <ArrowDownRight className="w-3 h-3 text-success" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3 text-destructive" />
                          )}
                        </div>
                        <Badge variant="outline" className={`capitalize ${trade.trade_type === 'buy' ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive'}`}>
                          {trade.trade_type}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {!isPlaceholderTokenText(trade.token_symbol) ? trade.token_symbol : shortAddress(trade.token_address)}
                      </div>
                      {!isPlaceholderTokenText(trade.token_name) && (
                        <div className="text-xs text-muted-foreground truncate max-w-[150px]">{trade.token_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {trade.amount.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium text-primary">
                        {trade.price_sol ? `${trade.price_sol.toFixed(6)} SOL` : '-'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {trade.price_usd ? `($${trade.price_usd.toFixed(4)})` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          trade.status === 'completed' ? 'bg-success/10 text-success border-success/30' :
                          trade.status === 'failed' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                          'bg-warning/10 text-warning border-warning/30'
                        }`}
                      >
                        {trade.status || 'pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {trade.tx_hash ? (
                        <a
                          href={`https://solscan.io/tx/${trade.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
