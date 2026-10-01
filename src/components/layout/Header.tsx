import React from 'react';
import { Film, Sparkles, Sliders, Info, Zap, Orbit } from 'lucide-react';
import { OutputQuality } from '../../types/video';
import type { AppTab } from '../../types/studio';

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  outputQuality: OutputQuality;
  onOpenQualityModal: () => void;
  onOpenAboutModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  outputQuality,
  onOpenQualityModal,
  onOpenAboutModal,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80 transition-all">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between gap-3">
        {/* Zone 1: Brand Wordmark with 3D Glowing Cube Icon */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl blur-xs opacity-75 group-hover:opacity-100 transition duration-300" />
            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
              <Film className="w-4 h-4 transform group-hover:rotate-6 transition-transform" />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm sm:text-base font-extrabold tracking-tight text-white whitespace-nowrap bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
                AI Video Studio
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-700/50">
                <Zap className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                FFmpeg 9 Native
              </span>
            </div>
          </div>
        </div>

        {/* Zone 2: Navigation Links (Desktop/Tablet) with Glass Pill Bar */}
        <nav className="hidden md:flex items-center gap-1 p-1 rounded-2xl bg-slate-950/70 border border-slate-800/80 backdrop-blur-md shadow-inner">
          <button
            type="button"
            onClick={() => onTabChange('video')}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'video'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Xử Lý Video</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('ai')}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'ai'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Nội Dung AI</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('studio')}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'studio'
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-fuchsia-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Orbit className="w-3.5 h-3.5 text-fuchsia-300" />
            <span>Xưởng Nội Dung</span>
          </button>
        </nav>

        {/* Zone 3: Quick Controls / Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Quality preset indicator button */}
          <button
            type="button"
            onClick={onOpenQualityModal}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs bg-slate-900/80 border border-slate-800/80 text-slate-300 hover:text-white hover:border-indigo-500/50 hover:bg-indigo-950/30 transition-all whitespace-nowrap shadow-xs"
            title="Chỉnh chất lượng xuất file"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400 hidden sm:inline">Chất lượng:</span>
            <span className="font-semibold text-indigo-300 capitalize text-[11px] sm:text-xs">
              {outputQuality === 'original' ? 'Max' : outputQuality}
            </span>
          </button>

          {/* Quick About / Architecture info modal trigger */}
          <button
            type="button"
            onClick={onOpenAboutModal}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900/80 border border-transparent hover:border-slate-800 transition-all"
            title="Thông tin công cụ & kiến trúc"
            aria-label="Thông tin"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
