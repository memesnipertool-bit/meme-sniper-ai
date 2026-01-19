import { format } from 'date-fns';

export interface TradeRecord {
  id: string;
  token_symbol: string;
  token_name: string;
  chain: string;
  entry_price: number;
  exit_price: number | null;
  amount: number;
  entry_value: number;
  current_value: number;
  profit_loss_percent: number | null;
  profit_loss_value: number | null;
  status: string;
  exit_reason: string | null;
  created_at: string;
  closed_at: string | null;
}

/**
 * Export trades to CSV format
 */
export function exportTradesToCSV(trades: TradeRecord[], filename?: string): void {
  if (!trades || trades.length === 0) {
    throw new Error('No trades to export');
  }

  const headers = [
    'ID',
    'Symbol',
    'Token Name',
    'Chain',
    'Status',
    'Entry Price',
    'Exit Price',
    'Amount',
    'Entry Value',
    'Current/Exit Value',
    'P&L %',
    'P&L Value',
    'Exit Reason',
    'Created At',
    'Closed At',
  ];

  const rows = trades.map((trade) => [
    trade.id,
    trade.token_symbol,
    trade.token_name,
    trade.chain,
    trade.status,
    trade.entry_price.toFixed(8),
    trade.exit_price?.toFixed(8) || '',
    trade.amount.toFixed(6),
    trade.entry_value.toFixed(2),
    trade.current_value.toFixed(2),
    trade.profit_loss_percent?.toFixed(2) || '0',
    trade.profit_loss_value?.toFixed(2) || '0',
    trade.exit_reason || '',
    format(new Date(trade.created_at), 'yyyy-MM-dd HH:mm:ss'),
    trade.closed_at ? format(new Date(trade.closed_at), 'yyyy-MM-dd HH:mm:ss') : '',
  ]);

  // Escape CSV values
  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => escapeCSV(String(cell))).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename || `trades_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate PDF report for trades (creates an HTML-based printable document)
 */
export function exportTradesToPDF(trades: TradeRecord[], title?: string): void {
  if (!trades || trades.length === 0) {
    throw new Error('No trades to export');
  }

  // Calculate summary stats
  const totalTrades = trades.length;
  const closedTrades = trades.filter((t) => t.status === 'closed');
  const openTrades = trades.filter((t) => t.status === 'open');
  const winners = closedTrades.filter((t) => (t.profit_loss_percent || 0) > 0);
  const losers = closedTrades.filter((t) => (t.profit_loss_percent || 0) < 0);
  const totalPnL = closedTrades.reduce((sum, t) => sum + (t.profit_loss_value || 0), 0);
  const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0;

  const reportDate = format(new Date(), 'MMMM dd, yyyy HH:mm');
  const reportTitle = title || 'Trade History Report';

  // Create printable HTML
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${reportTitle}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 20px;
          background: white;
          color: #1a1a1a;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #e5e5e5;
        }
        h1 { margin: 0 0 10px; color: #111; }
        .date { color: #666; font-size: 14px; }
        .summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
        }
        .stat-value { font-size: 24px; font-weight: bold; color: #111; }
        .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
        .positive { color: #22c55e; }
        .negative { color: #ef4444; }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        th, td {
          padding: 10px 8px;
          text-align: left;
          border-bottom: 1px solid #e5e5e5;
        }
        th { background: #f5f5f5; font-weight: 600; }
        tr:hover { background: #fafafa; }
        .status-open { color: #3b82f6; }
        .status-closed { color: #6b7280; }
        @media print {
          body { padding: 0; }
          .summary { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${reportTitle}</h1>
        <div class="date">Generated on ${reportDate}</div>
      </div>
      
      <div class="summary">
        <div class="stat-card">
          <div class="stat-value">${totalTrades}</div>
          <div class="stat-label">Total Trades</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${openTrades.length}</div>
          <div class="stat-label">Open Positions</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${winRate.toFixed(1)}%</div>
          <div class="stat-label">Win Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value ${totalPnL >= 0 ? 'positive' : 'negative'}">
            ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}
          </div>
          <div class="stat-label">Total P&L</div>
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Status</th>
            <th>Entry Price</th>
            <th>Exit Price</th>
            <th>Amount</th>
            <th>P&L %</th>
            <th>P&L Value</th>
            <th>Exit Reason</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${trades
            .map(
              (trade) => `
            <tr>
              <td><strong>${trade.token_symbol}</strong></td>
              <td class="status-${trade.status}">${trade.status}</td>
              <td>$${trade.entry_price.toFixed(8)}</td>
              <td>${trade.exit_price ? '$' + trade.exit_price.toFixed(8) : '-'}</td>
              <td>${trade.amount.toFixed(4)}</td>
              <td class="${(trade.profit_loss_percent || 0) >= 0 ? 'positive' : 'negative'}">
                ${(trade.profit_loss_percent || 0) >= 0 ? '+' : ''}${(trade.profit_loss_percent || 0).toFixed(2)}%
              </td>
              <td class="${(trade.profit_loss_value || 0) >= 0 ? 'positive' : 'negative'}">
                ${(trade.profit_loss_value || 0) >= 0 ? '+' : ''}$${(trade.profit_loss_value || 0).toFixed(2)}
              </td>
              <td>${trade.exit_reason || '-'}</td>
              <td>${format(new Date(trade.created_at), 'MM/dd/yy HH:mm')}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  // Open in new window for printing
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    // Slight delay to ensure styles load
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

/**
 * Export trades as JSON
 */
export function exportTradesToJSON(trades: TradeRecord[], filename?: string): void {
  if (!trades || trades.length === 0) {
    throw new Error('No trades to export');
  }

  const jsonContent = JSON.stringify(trades, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename || `trades_${format(new Date(), 'yyyy-MM-dd')}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
