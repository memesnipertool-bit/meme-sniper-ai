import React from "react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface DayStatement {
  date: string;
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  volume: number;
  realizedPnL: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
}

interface UserDayWiseStatementProps {
  statements: DayStatement[];
  loading?: boolean;
}

const formatCurrency = (value: number) => {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) return `${value >= 0 ? '' : '-'}$${(absValue / 1000000).toFixed(2)}M`;
  if (absValue >= 1000) return `${value >= 0 ? '' : '-'}$${(absValue / 1000).toFixed(2)}K`;
  return `${value >= 0 ? '' : '-'}$${absValue.toFixed(2)}`;
};

export function UserDayWiseStatement({ statements, loading }: UserDayWiseStatementProps) {
  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading statements...
      </div>
    );
  }

  if (statements.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No trading activity in the selected period
      </div>
    );
  }

  // Calculate totals
  const totals = statements.reduce(
    (acc, day) => ({
      totalTrades: acc.totalTrades + day.totalTrades,
      buyTrades: acc.buyTrades + day.buyTrades,
      sellTrades: acc.sellTrades + day.sellTrades,
      volume: acc.volume + day.volume,
      realizedPnL: acc.realizedPnL + day.realizedPnL,
      winningTrades: acc.winningTrades + day.winningTrades,
      losingTrades: acc.losingTrades + day.losingTrades,
    }),
    { totalTrades: 0, buyTrades: 0, sellTrades: 0, volume: 0, realizedPnL: 0, winningTrades: 0, losingTrades: 0 }
  );

  const overallWinRate = totals.totalTrades > 0 
    ? ((totals.winningTrades / (totals.winningTrades + totals.losingTrades)) * 100) || 0
    : 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-secondary/30 rounded-lg">
          <p className="text-xs text-muted-foreground">Period Trades</p>
          <p className="text-lg font-semibold text-foreground">{totals.totalTrades}</p>
          <p className="text-xs text-muted-foreground">
            {totals.buyTrades} buys / {totals.sellTrades} sells
          </p>
        </div>
        <div className="p-3 bg-secondary/30 rounded-lg">
          <p className="text-xs text-muted-foreground">Period Volume</p>
          <p className="text-lg font-semibold text-foreground">{formatCurrency(totals.volume)}</p>
        </div>
        <div className="p-3 bg-secondary/30 rounded-lg">
          <p className="text-xs text-muted-foreground">Period P&L</p>
          <p className={`text-lg font-semibold ${totals.realizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totals.realizedPnL >= 0 ? '+' : ''}{formatCurrency(totals.realizedPnL)}
          </p>
        </div>
        <div className="p-3 bg-secondary/30 rounded-lg">
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <p className="text-lg font-semibold text-foreground">{overallWinRate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">
            {totals.winningTrades}W / {totals.losingTrades}L
          </p>
        </div>
      </div>

      {/* Day-wise table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Trades</TableHead>
              <TableHead className="text-right">Buy/Sell</TableHead>
              <TableHead className="text-right">Volume</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead className="text-right">Win Rate</TableHead>
              <TableHead className="text-right">W/L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statements.map((day) => (
              <TableRow key={day.date} className="hover:bg-secondary/30">
                <TableCell className="font-medium">
                  {format(new Date(day.date), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {day.totalTrades}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-green-500">{day.buyTrades}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-red-500">{day.sellTrades}</span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(day.volume)}
                </TableCell>
                <TableCell className="text-right">
                  <span className={`inline-flex items-center gap-1 font-mono ${
                    day.realizedPnL > 0 
                      ? 'text-green-500' 
                      : day.realizedPnL < 0 
                      ? 'text-red-500' 
                      : 'text-muted-foreground'
                  }`}>
                    {day.realizedPnL > 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : day.realizedPnL < 0 ? (
                      <TrendingDown className="w-3 h-3" />
                    ) : (
                      <Minus className="w-3 h-3" />
                    )}
                    {day.realizedPnL >= 0 ? '+' : ''}{formatCurrency(day.realizedPnL)}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {day.winRate.toFixed(0)}%
                </TableCell>
                <TableCell className="text-right text-sm">
                  <span className="text-green-500">{day.winningTrades}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-red-500">{day.losingTrades}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
