import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Youtube,
  Share2,
  Hash,
  Tag,
  Search,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Sliders,
  Radio,
  FileText,
  Clock,
  ExternalLink,
  ShieldCheck,
  X,
  Plus,
  Loader2,
  Tv,
} from 'lucide-react';
import { VideoItem } from '../../types/video';
import {
  AIContentSEOProgress,
  PlatformSEOItem,
  SEOContentPackage,
  SEOPlatform,
  TitleTone,
  VideoFacts,
} from '../../lib/ai-content/types';
import { PLATFORM_RULES, TITLE_TONE_GUIDELINES } from '../../lib/ai-content/platform-rules';
import { aiContentClient } from '../../lib/ai-content/aiContentClient';

interface AIContentPanelProps {
  selectedVideo: VideoItem | null;
  onSeekVideo?: (seconds: number) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AIContentPanel: React.FC<AIContentPanelProps> = ({
  selectedVideo,
  onSeekVideo,
  onShowToast,
}) => {
  // 1. Settings state
  const [selectedPlatforms, setSelectedPlatforms] = useState<SEOPlatform[]>([
    'youtube_long',
    'tiktok',
  ]);
  const [titleTone, setTitleTone] = useState<TitleTone>('professional');
  const [contentLanguage, setContentLanguage] = useState<'vi' | 'en'>('vi');
  const [channelName, setChannelName] = useState<string>(() => {
    return localStorage.getItem('ai_channel_name') || '';
  });
  const [primaryKeyword, setPrimaryKeyword] = useState<string>('');
  const [userContext, setUserContext] = useState<string>('');
  const [includeTranscript, setIncludeTranscript] = useState<boolean>(true);

  // 2. Generation & Progress state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<AIContentSEOProgress | null>(null);
  const [seoPackage, setSeoPackage] = useState<SEOContentPackage | null>(null);
  const [activePlatformTab, setActivePlatformTab] = useState<SEOPlatform>('youtube_long');

  // 3. UI interaction state
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [showFactDetails, setShowFactDetails] = useState(false);
  const [newHashtagInput, setNewHashtagInput] = useState('');

  // Persist channel name
  useEffect(() => {
    if (channelName) {
      localStorage.setItem('ai_channel_name', channelName);
    }
  }, [channelName]);

  // Clear when video changes
  useEffect(() => {
    setSeoPackage(null);
    setProgress(null);
  }, [selectedVideo?.id]);

  // Ensure active tab is within selected platforms
  useEffect(() => {
    if (seoPackage && !seoPackage.platforms[activePlatformTab]) {
      const firstAvailable = Object.keys(seoPackage.platforms)[0] as SEOPlatform;
      if (firstAvailable) setActivePlatformTab(firstAvailable);
    }
  }, [seoPackage, activePlatformTab]);

  const togglePlatform = (p: SEOPlatform) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length === 1) {
        onShowToast('Cần chọn ít nhất một nền tảng.', 'info');
        return;
      }
      setSelectedPlatforms(selectedPlatforms.filter((item) => item !== p));
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(label);
    onShowToast(`Đã sao chép ${label}!`, 'success');
    setTimeout(() => setCopiedItem(null), 2000);
  };

  // Main generation flow: 4 strictly executed steps
  const handleStartAnalysis = async () => {
    if (!selectedVideo) {
      onShowToast('Vui lòng chọn hoặc tải video lên trước.', 'error');
      return;
    }

    if (selectedPlatforms.length === 0) {
      onShowToast('Vui lòng chọn ít nhất một nền tảng đăng.', 'error');
      return;
    }

    setIsProcessing(true);
    setProgress({ step: 'reading_video', message: 'Bắt đầu quy trình phân tích...', percent: 5 });

    try {
      // Step 0: Upload video to temp server endpoint
      const uploadResult = await aiContentClient.uploadVideo(selectedVideo, setProgress);

      // Step 1: Gemini Files API reads full video -> Video Facts
      const facts = await aiContentClient.extractVideoFacts(
        uploadResult,
        setProgress
      );

      // Auto-fill channel name if detected in video entities
      if (!channelName && facts.entities.some((e) => e.type === 'channel')) {
        const found = facts.entities.find((e) => e.type === 'channel');
        if (found?.name) {
          setChannelName(found.name);
          localStorage.setItem('ai_channel_name', found.name);
        }
      }

      // Step 2: Real Keyword Research (YouTube + Google Suggest + Top videos)
      const keywordResearch = await aiContentClient.researchKeywords(
        facts,
        channelName,
        primaryKeyword,
        setProgress
      );

      // Step 3 & 4: Multi-platform generation and fact checking
      const finalPackage = await aiContentClient.generateSEOPackage(
        {
          videoFacts: facts,
          selectedPlatforms,
          keywordResearch,
          channelName,
          primaryKeyword,
          userContext,
          titleTone,
          includeTranscript,
        },
        setProgress
      );

      setSeoPackage(finalPackage);
      setActivePlatformTab(selectedPlatforms[0]);
      onShowToast('Đã tạo thành công nội dung SEO bám sát 100% video!', 'success');
    } catch (err: any) {
      console.error('[AIContentPanel] Error during SEO generation:', err);
      onShowToast(err.message || 'Đã có lỗi xảy ra trong quá trình phân tích.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const currentPlatformData: PlatformSEOItem | undefined = seoPackage?.platforms[activePlatformTab];

  // Helper to update current platform data locally
  const updateCurrentPlatform = (updater: (prev: PlatformSEOItem) => PlatformSEOItem) => {
    if (!seoPackage || !currentPlatformData) return;
    const updated = updater(currentPlatformData);
    setSeoPackage({
      ...seoPackage,
      platforms: {
        ...seoPackage.platforms,
        [activePlatformTab]: updated,
      },
    });
  };

  const handleSelectTitle = (idx: number) => {
    updateCurrentPlatform((prev) => ({ ...prev, selectedTitleIndex: idx }));
  };

  const handleRemoveHashtag = (tagToRemove: string) => {
    updateCurrentPlatform((prev) => ({
      ...prev,
      hashtags: prev.hashtags.filter((h) => h !== tagToRemove),
    }));
  };

  const handleAddHashtag = () => {
    if (!newHashtagInput.trim()) return;
    let clean = newHashtagInput.trim().replace(/\s+/g, '');
    if (!clean.startsWith('#')) clean = `#${clean}`;
    updateCurrentPlatform((prev) => ({
      ...prev,
      hashtags: prev.hashtags.includes(clean) ? prev.hashtags : [...prev.hashtags, clean],
    }));
    setNewHashtagInput('');
  };

  const handleCopyAllForPlatform = () => {
    if (!currentPlatformData) return;
    const title = currentPlatformData.titles[currentPlatformData.selectedTitleIndex] || currentPlatformData.titles[0];
    const textToCopy = `${title}\n\n${currentPlatformData.description}\n\n${currentPlatformData.hashtags.join(' ')}`;
    handleCopy(textToCopy, `toàn bộ nội dung ${PLATFORM_RULES[activePlatformTab].name}`);
  };

  const platformsConfig: Array<{ id: SEOPlatform; label: string; icon: string; sub: string }> = [
    { id: 'youtube_long', label: 'YouTube Video Dài', icon: '📺', sub: 'Chuẩn SEO, 100 ký tự, thẻ tags' },
    { id: 'youtube_shorts', label: 'YouTube Shorts', icon: '⚡', sub: 'Dọc, ≤60 ký tự, #shorts' },
    { id: 'tiktok', label: 'TikTok', icon: '🎵', sub: 'Hook 3s, 100-300 ký tự' },
    { id: 'facebook', label: 'Facebook', icon: '📘', sub: 'Reels / Post, câu hỏi mở' },
    { id: 'instagram', label: 'Instagram', icon: '📸', sub: 'Reels / Feed, thẩm mỹ cao' },
  ];

  const toneOptions: Array<{ id: TitleTone; label: string; desc: string }> = [
    { id: 'professional', label: 'Chuyên nghiệp', desc: 'Chuẩn mực, uy tín, chính xác' },
    { id: 'curiosity', label: 'Tò mò / Câu hỏi', desc: 'Kích thích khám phá, khoảng trống thông tin' },
    { id: 'numbers', label: 'Con số nổi bật', desc: 'Số liệu, thời gian, sự kiện cụ thể' },
    { id: 'natural', label: 'Tự nhiên', desc: 'Gần gũi, đời thường như trò chuyện' },
  ];

  return (
    <div className="space-y-4">
      {/* Configuration Card */}
      <div className="glass-panel rounded-3xl p-4 sm:p-6 space-y-5 shadow-xl shadow-black/40 border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-950/70 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Trí Tuệ Nhân Tạo: Phân Tích & Tối Ưu SEO Đa Nền Tảng
              </h3>
              <p className="text-[11px] text-slate-400">
                Đọc nguyên bản video (hình ảnh + âm thanh) qua Gemini Files API, nghiên cứu từ khóa thật, không bịa đặt.
              </p>
            </div>
          </div>
        </div>

        {/* 1. Multi-Platform Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <span>1. Nền tảng đăng tải:</span>
              <span className="text-[10px] text-indigo-400 font-normal">(Có thể chọn nhiều nền tảng cùng lúc)</span>
            </label>
            <span className="text-[11px] text-slate-400">
              Đã chọn: <strong className="text-white">{selectedPlatforms.length}</strong> nền tảng
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {platformsConfig.map((p) => {
              const isSelected = selectedPlatforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`p-2.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-indigo-950/50 border-indigo-500 text-white shadow-md shadow-indigo-500/10'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-base">{p.icon}</span>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded accent-indigo-500 cursor-pointer pointer-events-none"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold leading-tight truncate">{p.label}</p>
                    <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{p.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Channel Name, Keyword & Context Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Tên kênh:</span>
              <span className="text-[10px] text-slate-500 font-mono">Tự lưu</span>
            </label>
            <input
              type="text"
              placeholder="VD: Kinh Tế 8 Phút, Tóm Tắt Nhanh..."
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">
              Từ khóa chính (tùy chọn):
            </label>
            <input
              type="text"
              placeholder="VD: giá vàng, chứng khoán, du lịch..."
              value={primaryKeyword}
              onChange={(e) => setPrimaryKeyword(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">
              Bối cảnh thêm (tùy chọn):
            </label>
            <input
              type="text"
              placeholder="VD: Màn hình cảm ơn cuối video, giảm giá 20%..."
              value={userContext}
              onChange={(e) => setUserContext(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* 3. Title Tone & Content Language */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
          {/* Title Tone */}
          <div className="sm:col-span-8 space-y-1.5">
            <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
              2. Giọng văn tiêu đề:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {toneOptions.map((t) => {
                const isSel = titleTone === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTitleTone(t.id)}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      isSel
                        ? 'bg-indigo-600/30 border-indigo-500 text-white ring-1 ring-indigo-400 font-semibold'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-xs leading-tight">{t.label}</p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{t.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language & Transcript Switch */}
          <div className="sm:col-span-4 space-y-1.5">
            <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
              3. Ngôn ngữ nội dung:
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setContentLanguage('vi')}
                className={`py-1.5 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                  contentLanguage === 'vi'
                    ? 'bg-indigo-600 text-white border-indigo-400 font-semibold'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                🇻🇳 Tiếng Việt
              </button>
              <button
                type="button"
                onClick={() => setContentLanguage('en')}
                className={`py-1.5 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                  contentLanguage === 'en'
                    ? 'bg-indigo-600 text-white border-indigo-400 font-semibold'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                🇬🇧 English
              </button>
            </div>

            {/* Transcript switch */}
            <div className="pt-1">
              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTranscript}
                  onChange={(e) => setIncludeTranscript(e.target.checked)}
                  className="rounded accent-indigo-500 cursor-pointer"
                />
                <span>Kèm bóc lời thoại (Mặc định bật)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Action Button & Step Progress */}
        <div className="pt-2 border-t border-slate-800/80 space-y-3">
          <button
            type="button"
            disabled={isProcessing || !selectedVideo}
            onClick={handleStartAnalysis}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang phân tích & tối ưu SEO...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Phân tích & Tạo nội dung SEO</span>
              </>
            )}
          </button>

          {/* 4-Step Progress Indicator */}
          {isProcessing && progress && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  {progress.message}
                </span>
                <span className="font-mono text-indigo-400 font-bold">{progress.percent}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              {/* 4 Steps Checklist */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                <div className={`flex items-center gap-1.5 ${progress.percent >= 25 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>1. Đọc video (Facts)</span>
                </div>
                <div className={`flex items-center gap-1.5 ${progress.percent >= 50 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>2. Nghiên cứu từ khóa</span>
                </div>
                <div className={`flex items-center gap-1.5 ${progress.percent >= 75 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>3. Viết nội dung</span>
                </div>
                <div className={`flex items-center gap-1.5 ${progress.percent >= 95 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>4. Kiểm tra độ khớp</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Video Ground Truth Banner (if facts available) */}
      {seoPackage && (
        <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-700/40 text-xs text-indigo-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="font-semibold text-white">
                Bản chất video: <span className="uppercase text-amber-300">{seoPackage.videoFacts.video_type}</span>
                {seoPackage.videoFacts.entities.some((e) => e.type === 'channel') && (
                  <span className="text-slate-300 ml-1">
                    · Kênh:{' '}
                    <strong className="text-white">
                      {seoPackage.videoFacts.entities.find((e) => e.type === 'channel')?.name}
                    </strong>
                  </span>
                )}
              </p>
              <p className="text-[11px] text-slate-300">{seoPackage.videoFacts.summary}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowFactDetails(!showFactDetails)}
            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-300 hover:text-white px-2 py-1 rounded-lg bg-indigo-900/60 border border-indigo-600/40 transition"
          >
            <span>{showFactDetails ? 'Ẩn chi tiết Fact-check' : 'Xem sự thật bóc tách'}</span>
            {showFactDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Collapsible Facts Drawer */}
          {showFactDetails && (
            <div className="w-full mt-2 pt-2 border-t border-indigo-800/60 space-y-2 text-[11px] text-slate-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <strong className="text-white">Chữ trên màn hình (On-screen Text):</strong>
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-slate-400">
                    {seoPackage.videoFacts.on_screen_text.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong className="text-white">Thực thể & Sự kiện nhận diện:</strong>
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-slate-400">
                    {seoPackage.videoFacts.entities.map((e, i) => (
                      <li key={i}>
                        {e.name} ({e.type})
                      </li>
                    ))}
                    {seoPackage.videoFacts.numbers_and_facts.map((n, i) => (
                      <li key={`f_${i}`}>{n.fact}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Output Section: Multi-Platform Tabs & Rich SEO Card */}
      {seoPackage && currentPlatformData && (
        <div className="glass-panel rounded-3xl p-4 sm:p-6 space-y-5 border border-slate-800 shadow-2xl">
          {/* Header & Platform Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {seoPackage.selectedPlatforms.map((plat) => {
                const isActive = activePlatformTab === plat;
                const rule = PLATFORM_RULES[plat];
                return (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => setActivePlatformTab(plat)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                        : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                    }`}
                  >
                    <span>{plat === 'youtube_long' ? '📺' : plat === 'youtube_shorts' ? '⚡' : plat === 'tiktok' ? '🎵' : plat === 'facebook' ? '📘' : '📸'}</span>
                    <span>{rule.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Match score badge & Copy All */}
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-600/40">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Khớp video: {currentPlatformData.match_score}%</span>
              </span>

              <button
                type="button"
                onClick={handleCopyAllForPlatform}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
              >
                <Copy className="w-3 h-3" />
                <span>Copy tất cả cho nền tảng này</span>
              </button>
            </div>
          </div>

          {/* A. 3 Titles (Select 1, Count chars, Copy) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <span>Tiêu đề chuẩn SEO (Chọn 1 trong 3 phương án):</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Khuyên dùng: {PLATFORM_RULES[activePlatformTab].bestTitleLengthRange[0]}-
                {PLATFORM_RULES[activePlatformTab].bestTitleLengthRange[1]} ký tự
              </span>
            </div>

            <div className="space-y-2">
              {currentPlatformData.titles.map((titleText, idx) => {
                const isSelected = currentPlatformData.selectedTitleIndex === idx;
                const charCount = titleText.length;
                const maxChar = PLATFORM_RULES[activePlatformTab].maxTitleLength;
                const isOptimal =
                  charCount >= PLATFORM_RULES[activePlatformTab].bestTitleLengthRange[0] &&
                  charCount <= PLATFORM_RULES[activePlatformTab].bestTitleLengthRange[1];

                return (
                  <div
                    key={idx}
                    onClick={() => handleSelectTitle(idx)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-400 text-white shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="pt-0.5">
                        <input
                          type="radio"
                          name="title_selection"
                          checked={isSelected}
                          onChange={() => handleSelectTitle(idx)}
                          className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-snug">{titleText}</p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>Phương án #{idx + 1}</span>
                          <span>•</span>
                          <span className={isOptimal ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                            {charCount}/{maxChar} ký tự {isOptimal ? '(Tối ưu SEO)' : ''}
                          </span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(titleText, `Tiêu đề #${idx + 1}`);
                      }}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 shrink-0"
                      title="Copy tiêu đề này"
                    >
                      {copiedItem === `Tiêu đề #${idx + 1}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* B. Editable Description & Copy */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>Nội dung mô tả / Caption:</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400">
                  {currentPlatformData.description.length} ký tự
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(currentPlatformData.description, 'Mô tả')}
                  className="flex items-center gap-1 text-[11px] font-semibold text-indigo-300 hover:text-white px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            <textarea
              rows={5}
              value={currentPlatformData.description}
              onChange={(e) => {
                const val = e.target.value;
                updateCurrentPlatform((prev) => ({ ...prev, description: val }));
              }}
              className="w-full p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-white text-xs leading-relaxed focus:border-indigo-500 focus:outline-none scrollbar-thin resize-y"
            />
          </div>

          {/* C. Interactive Hashtags (Chips: click to remove, add custom) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-pink-400" />
                <span>Hashtags ({currentPlatformData.hashtags.length}):</span>
              </label>
              <button
                type="button"
                onClick={() => handleCopy(currentPlatformData.hashtags.join(' '), 'Hashtags')}
                className="flex items-center gap-1 text-[11px] font-semibold text-pink-300 hover:text-white px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800"
              >
                <Copy className="w-3 h-3" />
                <span>Copy tất cả hashtag</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-2xl bg-slate-950/60 border border-slate-800">
              {currentPlatformData.hashtags.map((tagText) => (
                <span
                  key={tagText}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-pink-950/40 border border-pink-700/40 text-pink-300 text-xs font-semibold"
                >
                  <span>{tagText}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveHashtag(tagText)}
                    className="hover:text-white text-pink-400/80"
                    title="Xóa hashtag này"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              {/* Add custom hashtag inline input */}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="#them_hashtag..."
                  value={newHashtagInput}
                  onChange={(e) => setNewHashtagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddHashtag();
                    }
                  }}
                  className="px-2 py-1 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs w-28 focus:outline-none focus:border-pink-500"
                />
                <button
                  type="button"
                  onClick={handleAddHashtag}
                  className="p-1 rounded-lg bg-pink-900/60 text-pink-300 hover:text-white"
                  title="Thêm hashtag"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* D. YouTube Tags (Only for YouTube Long or Shorts) */}
          {(activePlatformTab === 'youtube_long' || activePlatformTab === 'youtube_shorts') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                  <span>Thẻ Tags YouTube ({currentPlatformData.tags.length} thẻ):</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400">
                    Tổng: {currentPlatformData.tags.join(', ').length}/500 ký tự
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(currentPlatformData.tags.join(', '), 'Tags YouTube')}
                    className="flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-white px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy dán vào YouTube Studio</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl bg-slate-950/60 border border-slate-800">
                {currentPlatformData.tags.map((t, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700/80 text-slate-300 text-[11px] font-mono"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* E. Used Keywords & Real Sources */}
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2 text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-indigo-400" />
              <span>Từ khóa thực tế đã dùng & Nguồn dữ liệu:</span>
            </span>

            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded-xl bg-indigo-950/60 border border-indigo-700/50 text-indigo-300 font-semibold">
                ⭐ Từ khóa chính: &quot;{currentPlatformData.primary_keyword}&quot;
              </span>

              {Object.entries(currentPlatformData.keyword_sources).map(([kw, src], idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[11px] flex items-center gap-1"
                >
                  <strong className="text-white">{kw}</strong>
                  <span className="text-[9px] text-indigo-400 bg-indigo-950 px-1 rounded font-mono">
                    [{src}]
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
