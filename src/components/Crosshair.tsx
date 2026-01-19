const Crosshair = ({ className = "" }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer circle */}
      <circle
        cx="50"
        cy="50"
        r="45"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.3"
      />
      {/* Inner circle */}
      <circle
        cx="50"
        cy="50"
        r="25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.5"
      />
      {/* Center dot */}
      <circle cx="50" cy="50" r="3" fill="currentColor" />
      {/* Crosshair lines */}
      <line
        x1="50"
        y1="5"
        x2="50"
        y2="25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="50"
        y1="75"
        x2="50"
        y2="95"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="5"
        y1="50"
        x2="25"
        y2="50"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="75"
        y1="50"
        x2="95"
        y2="50"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Corner brackets */}
      <path
        d="M15 25 L15 15 L25 15"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M85 25 L85 15 L75 15"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M15 75 L15 85 L25 85"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M85 75 L85 85 L75 85"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
};

export default Crosshair;
