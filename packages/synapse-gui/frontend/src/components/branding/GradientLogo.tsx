interface GradientLogoProps {
  onClick?: () => void;
}

export function GradientLogo({ onClick }: GradientLogoProps) {
  return (
    <div 
      onClick={onClick} 
      className="flex items-center gap-2 font-bold text-xl tracking-tight text-slate-800 cursor-pointer"
    >
      <span className="bg-gradient-to-r from-blue-600 via-blue-400 to-purple-400 bg-clip-text text-transparent">
        Synapse
      </span>
    </div>
  );
}