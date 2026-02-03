import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
}

const StatsCard = ({ title, value, change, changeType = "neutral", icon: Icon }: StatsCardProps) => {
  const changeColors = {
    positive: "text-success",
    negative: "text-destructive",
    neutral: "text-muted-foreground",
  };

  return (
    <div className="glass rounded-xl p-3 md:p-4 lg:p-5 hover:border-primary/20 transition-all duration-300">
      <div className="flex items-start justify-between mb-2 md:mb-3 gap-2">
        <div className="p-2 md:p-2.5 rounded-lg bg-primary/10 shrink-0">
          <Icon className="w-4 h-4 md:w-5 md:h-5 text-primary" />
        </div>
        {change && (
          <span className={`text-xs font-medium text-right ${changeColors[changeType]}`}>
            {change}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-1 line-clamp-1">{title}</p>
      <p className="text-value-md text-foreground font-mono break-all">{value}</p>
    </div>
  );
};

export default StatsCard;
