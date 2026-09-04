export function AppBackground() {
  return (
    // from-pink-550 via-orange-500 to-yellow-400 
    // from-pink-50 via-orange-50 to-yellow-50
    //from-blue-50 via-slate-50 to-pink-50
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-gradient-to-br from-slate-50 via-pink-50 to-amber-40">
      <style>{`
        @keyframes waveMotionSlow { 0% { transform: translateY(0px) scaleY(1); } 50% { transform: translateY(-15px) scaleY(1.03); } 100% { transform: translateY(0px) scaleY(1); } }
        @keyframes pulseNode { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.4); } }
        .animate-wave-slow { animation: waveMotionSlow 18s ease-in-out infinite; }
        .animate-pulse-slow { animation: pulseNode 4s ease-in-out infinite; transform-origin: center; }
      `}</style>
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-purple-400/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-amber-400/10 rounded-full blur-[120px]" />
      <svg className="absolute w-full h-full min-w-[1200px] opacity-30 animate-wave-slow" viewBox="0 0 1440 800" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <path d="M-100,500 C200,350 400,650 720,500 C1040,350 1200,600 1540,450" stroke="#0D9488" strokeWidth="0.75" strokeDasharray="4 4" />
        <path d="M-100,550 C250,650 500,400 720,550 C940,700 1250,450 1540,580" stroke="#06B6D4" strokeWidth="0.5" opacity="0.8" />
        <path d="M-100,450 C300,350 450,550 720,450 C990,350 1300,550 1540,400" stroke="#14B8A6" strokeWidth="1" opacity="0.6" />
        <circle cx="180" cy="460" r="2.5" fill="#0D9488" className="animate-pulse-slow" />
        <circle cx="480" cy="515" r="2.5" fill="#F59E0B" className="animate-pulse-slow" style={{ animationDelay: "1s" }} opacity="0.9" />
        <circle cx="720" cy="500" r="3" fill="#06B6D4" className="animate-pulse-slow" style={{ animationDelay: "2s" }} />
        <circle cx="980" cy="465" r="2" fill="#bf5edd" className="animate-pulse-slow" style={{ animationDelay: "0.5s" }} />
        <circle cx="1220" cy="525" r="2" fill="#fad28f" className="animate-pulse-slow" style={{ animationDelay: "1.5s" }} opacity="0.9" />
      </svg>
    </div>
  );
}