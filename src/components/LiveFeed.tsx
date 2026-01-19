import { useState, useEffect } from "react";
import { Activity, Zap } from "lucide-react";

interface FeedItem {
  id: string;
  type: "buy" | "sell" | "new";
  token: string;
  amount: string;
  time: string;
}

const LiveFeed = () => {
  const [items, setItems] = useState<FeedItem[]>([
    { id: "1", type: "buy", token: "PEPE", amount: "$2.5K", time: "2s ago" },
    { id: "2", type: "new", token: "WOJAK", amount: "New Token", time: "5s ago" },
    { id: "3", type: "sell", token: "DOGE", amount: "$1.2K", time: "8s ago" },
    { id: "4", type: "buy", token: "SHIB", amount: "$5.8K", time: "12s ago" },
    { id: "5", type: "new", token: "BONK", amount: "New Token", time: "15s ago" },
  ]);

  const typeStyles = {
    buy: "bg-success/10 text-success border-success/20",
    sell: "bg-destructive/10 text-destructive border-destructive/20",
    new: "bg-accent/10 text-accent border-accent/20",
  };

  const typeLabels = {
    buy: "BUY",
    sell: "SELL",
    new: "NEW",
  };

  return (
    <div className="glass rounded-xl p-4 md:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-primary animate-pulse" />
        <h3 className="font-semibold text-foreground">Live Feed</h3>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-success">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          Live
        </span>
      </div>
      
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors animate-slide-in-right"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${typeStyles[item.type]}`}>
              {typeLabels[item.type]}
            </span>
            <span className="font-medium text-foreground font-mono">${item.token}</span>
            <span className="text-sm text-muted-foreground ml-auto">{item.amount}</span>
            <span className="text-xs text-muted-foreground">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveFeed;
