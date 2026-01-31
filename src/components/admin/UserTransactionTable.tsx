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
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, ArrowRightLeft, ExternalLink } from "lucide-react";

interface Transaction {
  id: string;
  token_address: string;
  token_symbol: string | null;
  token_name: string | null;
  trade_type: 'buy' | 'sell';
  amount: number;
  price_sol: number | null;
  price_usd: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: string;
}

interface UserTransactionTableProps {
  transactions: Transaction[];
  loading?: boolean;
}

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  if (Math.abs(value) >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(6)}`;
};

const formatSol = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(6)} SOL`;
};

const formatAmount = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
};

export function UserTransactionTable({ transactions, loading }: UserTransactionTableProps) {
  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading transactions...
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No transactions found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[100px]">Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Token</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Price (USD)</TableHead>
            <TableHead className="text-right">Price (SOL)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">TX</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => (
            <TableRow key={tx.id} className="hover:bg-secondary/30">
              <TableCell className="text-xs text-muted-foreground">
                {format(new Date(tx.created_at), 'MMM d, HH:mm')}
              </TableCell>
              <TableCell>
                <Badge
                  variant={tx.trade_type === 'buy' ? 'default' : 'secondary'}
                  className={`text-xs ${
                    tx.trade_type === 'buy' 
                      ? 'bg-green-500/20 text-green-500 border-green-500/30' 
                      : 'bg-red-500/20 text-red-500 border-red-500/30'
                  }`}
                >
                  {tx.trade_type === 'buy' ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {tx.trade_type.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {tx.token_symbol || 'Unknown'}
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                    {tx.token_name || tx.token_address.slice(0, 8) + '...'}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatAmount(tx.amount)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatCurrency(tx.price_usd)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-muted-foreground">
                {formatSol(tx.price_sol)}
              </TableCell>
              <TableCell>
                <Badge 
                  variant="outline" 
                  className={`text-xs ${
                    tx.status === 'confirmed' 
                      ? 'text-green-500 border-green-500/30' 
                      : tx.status === 'failed' 
                      ? 'text-red-500 border-red-500/30' 
                      : 'text-yellow-500 border-yellow-500/30'
                  }`}
                >
                  {tx.status || 'pending'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {tx.tx_hash ? (
                  <a
                    href={`https://solscan.io/tx/${tx.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
