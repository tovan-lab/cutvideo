import React from 'react';

export const Background3D: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
      {/* 1. Deep cosmic gradient base */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />

      {/* 2. 3D Perspective Grid with subtle drift */}
      <div className="absolute inset-0 bg-perspective-grid opacity-35 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />

      {/* 3. Floating 3D Glowing Spheres / Orbs */}
      {/* Orb 1: Violet/Indigo Glow - Top Left */}
      <div className="absolute -top-[15%] -left-[10%] w-[550px] h-[550px] rounded-full bg-gradient-to-tr from-indigo-600/25 via-purple-600/15 to-transparent blur-[120px] animate-orb-1" />

      {/* Orb 2: Fuchsia/Pink Glow - Bottom Right */}
      <div className="absolute -bottom-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-gradient-to-bl from-pink-600/20 via-purple-700/15 to-transparent blur-[130px] animate-orb-2" />

      {/* Orb 3: Cyan/Emerald Glow - Center Floating */}
      <div className="absolute top-[40%] left-[25%] w-[420px] h-[420px] rounded-full bg-gradient-to-r from-cyan-500/15 via-indigo-500/10 to-transparent blur-[110px] animate-orb-3" />

      {/* 4. Subtle top light horizon flare */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 max-w-4xl h-[1px] bg-gradient-to-r from-transparent via-indigo-500/35 to-transparent" />
    </div>
  );
};
