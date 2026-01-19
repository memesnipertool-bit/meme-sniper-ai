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
      <div className="flex items-start justify-between mb-2 md:mb-3">
        <div className="p-2 md:p-2.5 rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 md:w-5 md:h-5 text-primary" />
        </div>
        {change && (
          <span className={`text-[10px] md:text-sm font-medium ${changeColors[changeType]}`}>
            {change}
          </span>
        )}
      </div>
      <p className="text-[10px] md:text-sm text-muted-foreground mb-0.5 md:mb-1 truncate">{title}</p>
      <p className="text-lg md:text-2xl lg:text-3xl font-bold text-foreground font-mono truncate">{value}</p>
    </div>
  );
};

export default StatsCard;
