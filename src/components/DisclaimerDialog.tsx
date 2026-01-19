import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Shield, Wallet, Info, Scale } from "lucide-react";

interface DisclaimerDialogProps {
  open: boolean;
  onAcknowledge: () => Promise<boolean>;
}

const DisclaimerDialog = ({ open, onAcknowledge }: DisclaimerDialogProps) => {
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAcknowledge = async () => {
    if (!agreed) return;
    setIsSubmitting(true);
    const success = await onAcknowledge();
    if (!success) {
      setIsSubmitting(false);
    }
  };

  const disclaimerPoints = [
    {
      icon: AlertTriangle,
      title: "No Financial Advice",
      description:
        "This platform does not provide financial, investment, or trading advice. All information presented is for informational purposes only and should not be construed as professional financial guidance.",
    },
    {
      icon: Shield,
      title: "No Guaranteed Profits",
      description:
        "Trading cryptocurrencies involves substantial risk of loss. Past performance is not indicative of future results. There are no guarantees of profit, and you may lose some or all of your invested capital.",
    },
    {
      icon: Scale,
      title: "User Responsibility",
      description:
        "You are solely responsible for your own trading decisions and their outcomes. You should conduct your own research and consult with qualified financial advisors before making any investment decisions.",
    },
    {
      icon: Info,
      title: "Informational & Automation Tool",
      description:
        "This platform is provided as an informational resource and automation tool only. It is designed to assist with monitoring and executing trades based on your configured parameters, not to make decisions on your behalf.",
    },
    {
      icon: Wallet,
      title: "No Custody of Funds",
      description:
        "This platform never stores, controls, or has access to your cryptocurrency funds. All transactions are executed directly through your connected wallet, and you maintain full custody of your assets at all times.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-6 w-6 text-primary" />
            Legal Disclaimer & Terms of Use
          </DialogTitle>
          <DialogDescription>
            Please read and acknowledge the following important information
            before using this platform.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 max-h-[50vh]">
          <div className="space-y-4">
            {disclaimerPoints.map((point, index) => (
              <div
                key={index}
                className="flex gap-4 p-4 rounded-lg bg-muted/50 border border-border"
              >
                <div className="flex-shrink-0">
                  <point.icon className="h-5 w-5 text-primary mt-0.5" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground">
                    {point.title}
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {point.description}
                  </p>
                </div>
              </div>
            ))}

            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive font-medium">
                ⚠️ Risk Warning: Cryptocurrency trading carries a high level of
                risk and may not be suitable for all investors. The high degree
                of leverage can work against you as well as for you. Before
                deciding to trade cryptocurrencies, you should carefully
                consider your investment objectives, level of experience, and
                risk appetite.
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-4 sm:flex-col">
          <div className="flex items-start gap-3 w-full p-3 rounded-lg bg-muted/30 border border-border">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-0.5"
            />
            <label
              htmlFor="agree"
              className="text-sm leading-relaxed cursor-pointer select-none"
            >
              I have read, understood, and agree to the above disclaimer. I
              acknowledge that I am solely responsible for my trading decisions
              and understand the risks involved.
            </label>
          </div>

          <Button
            onClick={handleAcknowledge}
            disabled={!agreed || isSubmitting}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? "Processing..." : "I Acknowledge & Accept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DisclaimerDialog;
