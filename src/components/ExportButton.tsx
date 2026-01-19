import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileText, FileSpreadsheet, FileJson, Loader2 } from 'lucide-react';
import { exportTradesToCSV, exportTradesToPDF, exportTradesToJSON, TradeRecord } from '@/lib/exportUtils';
import { toast } from 'sonner';

interface ExportButtonProps {
  trades: TradeRecord[];
  disabled?: boolean;
  className?: string;
}

export function ExportButton({ trades, disabled = false, className }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'csv' | 'pdf' | 'json') => {
    if (!trades || trades.length === 0) {
      toast.error('No trades to export');
      return;
    }

    setExporting(true);
    try {
      switch (format) {
        case 'csv':
          exportTradesToCSV(trades);
          toast.success('CSV exported successfully');
          break;
        case 'pdf':
          exportTradesToPDF(trades);
          toast.success('PDF report opened for printing');
          break;
        case 'json':
          exportTradesToJSON(trades);
          toast.success('JSON exported successfully');
          break;
      }
    } catch (error: any) {
      toast.error(error.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          disabled={disabled || exporting || !trades?.length}
          className={className}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('pdf')}>
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('json')}>
          <FileJson className="h-4 w-4 mr-2" />
          Export as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
