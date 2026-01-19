import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Zap, 
  Bot, 
  Search, 
  Settings, 
  ArrowRight,
  Wallet,
  Shield,
  BarChart3,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface QuickAction {
  icon: typeof Zap;
  label: string;
  description: string;
  path: string;
  color: string;
  bgColor: string;
}

const quickActions: QuickAction[] = [
  {
    icon: Zap,
    label: "Token Scanner",
    description: "Find new opportunities",
    path: "/scanner",
    color: "text-primary",
    bgColor: "from-primary/20 to-primary/5 border-primary/20",
  },
  {
    icon: Bot,
    label: "Configure Bot",
    description: "Auto-trading settings",
    path: "/sniper-settings",
    color: "text-blue-400",
    bgColor: "from-blue-500/20 to-blue-500/5 border-blue-500/20",
  },
  {
    icon: Shield,
    label: "Risk Settings",
    description: "Protect your trades",
    path: "/risk",
    color: "text-purple-400",
    bgColor: "from-purple-500/20 to-purple-500/5 border-purple-500/20",
  },
  {
    icon: BarChart3,
    label: "Portfolio",
    description: "View your holdings",
    path: "/portfolio",
    color: "text-success",
    bgColor: "from-success/20 to-success/5 border-success/20",
  },
];

export default function QuickActions() {
  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-xl">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-accent/10 rounded-full blur-3xl" />
      </div>
      
      <CardHeader className="relative pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/10">
            <Zap className="w-4 h-4 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
            <p className="text-xs text-muted-foreground">Jump to key features</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="relative pt-0">
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.path}
                to={action.path}
                className="group block"
              >
                <div
                  className={cn(
                    "p-3 rounded-xl bg-gradient-to-br border transition-all duration-300",
                    "hover:scale-[1.02] hover:shadow-lg",
                    action.bgColor,
                    "animate-fade-in"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className={cn("p-2 rounded-lg bg-background/50", action.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="font-medium text-sm">{action.label}</p>
                  <p className="text-[11px] text-muted-foreground">{action.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
