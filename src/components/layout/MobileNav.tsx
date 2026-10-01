import React from 'react';
import { Film, Sparkles, Sliders, Orbit } from 'lucide-react';
import { OutputQuality } from '../../types/video';
import type { AppTab } from '../../types/studio';

interface MobileNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  outputQuality: OutputQuality;
  onOpenQualityModal: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  onTabChange,
  outputQuality,
  onOpenQualityModal,
}) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-panel border-t border-slate-800/80 pb-safe shadow-2xl shadow-black/80">
      <div className="grid grid-cols-4 h-13 items-center max-w-md mx-auto px-2">
        {/* Tab 1: Video Tools */}
        <button
          type="button"
          onClick={() => onTabChange('video')}
          className={`relative min-h-[44px] flex flex-col items-center justify-center transition-all ${
            activeTab === 'video' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {activeTab === 'video' && (
            <div className="absolute top-1 w-8 h-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 shadow-sm shadow-indigo-500/80" />
          )}
          <Film className={`w-4.5 h-4.5 ${activeTab === 'video' ? 'scale-110' : ''} transition-transform`} />
          <span className="text-[10px] tracking-tight mt-0.5">Xử Lý Video</span>
        </button>

        {/* Tab 2: AI Content */}
        <button
          type="button"
          onClick={() => onTabChange('ai')}
          className={`relative min-h-[44px] flex flex-col items-center justify-center transition-all ${
            activeTab === 'ai' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {activeTab === 'ai' && (
            <div className="absolute top-1 w-8 h-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 shadow-sm shadow-indigo-500/80" />
          )}
          <Sparkles className={`w-4.5 h-4.5 ${activeTab === 'ai' ? 'scale-110 text-amber-400' : ''} transition-transform`} />
          <span className="text-[10px] tracking-tight mt-0.5">Nội Dung AI</span>
        </button>

        {/* Tab 3: Content Studio */}
        <button
          type="button"
          onClick={() => onTabChange('studio')}
          className={`relative min-h-[44px] flex flex-col items-center justify-center transition-all ${
            activeTab === 'studio' ? 'text-fuchsia-300 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {activeTab === 'studio' && (
            <div className="absolute top-1 w-8 h-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-sm shadow-fuchsia-500/80" />
          )}
          <Orbit className={`w-4.5 h-4.5 ${activeTab === 'studio' ? 'scale-110' : ''} transition-transform`} />
          <span className="text-[10px] tracking-tight mt-0.5">Xưởng</span>
        </button>

        {/* Tab 4: Quality modal trigger */}
        <button
          type="button"
          onClick={onOpenQualityModal}
          className="min-h-[44px] flex flex-col items-center justify-center text-slate-400 hover:text-slate-200 active:scale-95 transition-all"
        >
          <Sliders className="w-4.5 h-4.5" />
          <span className="text-[10px] font-mono tracking-tight mt-0.5 capitalize">
            {outputQuality === 'original' ? 'Gốc (Max)' : outputQuality}
          </span>
        </button>
      </div>
    </nav>
  );
};
