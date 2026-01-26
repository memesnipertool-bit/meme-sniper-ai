import { Button } from "@/components/ui/button";
import { useDisplayUnit, DisplayUnit } from "@/contexts/DisplayUnitContext";
import { DollarSign } from "lucide-react";

// SOL icon component
const SolIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    className={className}
    fill="currentColor"
  >
    <path d="M20.5 16.2L17.8 19.1C17.7 19.2 17.5 19.3 17.4 19.3H3.7C3.3 19.3 3.1 18.8 3.4 18.5L6.1 15.6C6.2 15.5 6.4 15.4 6.5 15.4H20.2C20.6 15.4 20.8 15.9 20.5 16.2Z"/>
    <path d="M20.5 5.2L17.8 8.1C17.7 8.2 17.5 8.3 17.4 8.3H3.7C3.3 8.3 3.1 7.8 3.4 7.5L6.1 4.6C6.2 4.5 6.4 4.4 6.5 4.4H20.2C20.6 4.4 20.8 4.9 20.5 5.2Z"/>
    <path d="M3.4 10.7L6.1 7.8C6.2 7.7 6.4 7.6 6.5 7.6H20.2C20.6 7.6 20.8 8.1 20.5 8.4L17.8 11.3C17.7 11.4 17.5 11.5 17.4 11.5H3.7C3.3 11.5 3.1 11 3.4 10.7Z"/>
  </svg>
);

interface UnitToggleProps {
  size?: 'sm' | 'md';
}

export default function UnitToggle({ size = 'sm' }: UnitToggleProps) {
  const { displayUnit, setDisplayUnit } = useDisplayUnit();

  const isSmall = size === 'sm';
  const buttonSize = isSmall ? 'h-7 px-2' : 'h-8 px-3';
  const iconSize = isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div className="flex items-center gap-0.5 bg-secondary/60 rounded-lg p-0.5">
      <Button
        variant="ghost"
        size="sm"
        className={`${buttonSize} rounded-md transition-all ${
          displayUnit === 'SOL'
            ? 'bg-primary text-primary-foreground hover:bg-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-transparent'
        }`}
        onClick={() => setDisplayUnit('SOL')}
      >
        <SolIcon className={iconSize} />
        <span className={`ml-1 ${isSmall ? 'text-xs' : 'text-sm'} font-medium`}>SOL</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`${buttonSize} rounded-md transition-all ${
          displayUnit === 'USD'
            ? 'bg-primary text-primary-foreground hover:bg-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-transparent'
        }`}
        onClick={() => setDisplayUnit('USD')}
      >
        <DollarSign className={iconSize} />
        <span className={`ml-1 ${isSmall ? 'text-xs' : 'text-sm'} font-medium`}>USD</span>
      </Button>
    </div>
  );
}
