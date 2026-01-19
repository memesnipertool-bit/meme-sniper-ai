import { Target, Zap, Brain, TrendingUp } from "lucide-react";
import Crosshair from "@/components/Crosshair";

const Index = () => {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      
      {/* Gradient glow effect */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20"
        style={{ background: 'var(--gradient-glow)' }}
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 md:px-12 lg:px-20">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 text-primary animate-pulse-glow">
              <Crosshair className="w-full h-full" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Meme Sniper <span className="text-primary">AI</span>
            </span>
          </div>
          <button className="px-4 py-2 text-sm font-medium border border-primary/50 rounded-lg text-primary hover:bg-primary/10 transition-all duration-300 hover:border-primary hover:glow-neon">
            Launch App
          </button>
        </header>

        {/* Hero Section */}
        <main className="flex flex-col items-center justify-center px-6 pt-20 pb-32 md:pt-32 md:pb-40 text-center">
          {/* Floating crosshair */}
          <div className="absolute right-[10%] top-[20%] w-32 h-32 text-primary/20 animate-scan hidden lg:block">
            <Crosshair />
          </div>
          <div className="absolute left-[8%] bottom-[25%] w-24 h-24 text-primary/15 animate-pulse-glow hidden lg:block">
            <Crosshair />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 text-xs font-medium uppercase tracking-widest border border-primary/30 rounded-full text-primary/80 bg-primary/5">
            <Zap className="w-3.5 h-3.5" />
            AI-Powered Precision Trading
          </div>

          {/* Main headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 max-w-4xl">
            Snipe Meme Coins
            <br />
            <span className="text-gradient-neon">Before They Moon</span>
          </h1>

          {/* Subheadline */}
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
            AI-driven analysis identifies high-potential meme tokens in milliseconds. 
            Execute trades with surgical precision.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button className="px-8 py-3.5 font-semibold text-primary-foreground bg-primary rounded-lg glow-neon hover:brightness-110 transition-all duration-300 flex items-center gap-2">
              <Target className="w-5 h-5" />
              Start Sniping
            </button>
            <button className="px-8 py-3.5 font-semibold border border-border rounded-lg hover:bg-secondary hover:border-primary/30 transition-all duration-300">
              View Demo
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 md:gap-16 mt-20 pt-10 border-t border-border/50">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient-neon font-mono">0.3ms</div>
              <div className="text-xs md:text-sm text-muted-foreground mt-1">Avg. Response</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient-neon font-mono">99.2%</div>
              <div className="text-xs md:text-sm text-muted-foreground mt-1">Accuracy Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient-neon font-mono">24/7</div>
              <div className="text-xs md:text-sm text-muted-foreground mt-1">Market Watch</div>
            </div>
          </div>
        </main>

        {/* Features */}
        <section className="px-6 md:px-12 lg:px-20 pb-20">
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <FeatureCard
              icon={<Brain className="w-6 h-6" />}
              title="AI Analysis"
              description="Deep learning models scan social signals, on-chain data, and market patterns."
            />
            <FeatureCard
              icon={<Target className="w-6 h-6" />}
              title="Precision Entry"
              description="Execute buys at optimal moments with sub-second transaction speeds."
            />
            <FeatureCard
              icon={<TrendingUp className="w-6 h-6" />}
              title="Risk Management"
              description="Smart stop-loss and take-profit automation protects your capital."
            />
          </div>
        </section>
      </div>
    </div>
  );
};

const FeatureCard = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => {
  return (
    <div className="p-6 rounded-xl bg-card border border-border hover:border-primary/30 transition-all duration-300 group hover:shadow-lg hover:shadow-primary/5">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:glow-neon transition-all duration-300">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
};

export default Index;
