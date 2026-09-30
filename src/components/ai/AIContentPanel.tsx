import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Video as VideoIcon,
  MessageSquare,
  Flame,
  Briefcase,
  Store,
  BookOpen,
  CheckCircle,
  BrainCircuit,
  Eye,
  AlertCircle,
  Loader2,
  Newspaper,
  Compass,
  Mic,
  Subtitles,
  HelpCircle,
} from 'lucide-react';
import {
  AIContentPackage,
  ContentGenerationRequest,
  ContentTone,
  Platform,
  TargetLanguage,
  VideoPurpose,
  VideoTranscript,
  VideoUnderstandingContext,
} from '../../types/aiContent';
import { VideoItem } from '../../types/video';
import { aiContentService } from '../../services/aiContentService';
import { ContentSection } from './ContentSection';
import { TranscriptViewer } from './TranscriptViewer';

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
  const [platform, setPlatform] = useState<Platform>('tiktok');
  const [tone, setTone] = useState<ContentTone>('strong_hook');
  const [language, setLanguage] = useState<TargetLanguage>('vi');
  const [videoPurpose, setVideoPurpose] = useState<VideoPurpose>('knowledge');
  const [userNotes, setUserNotes] = useState<string>('');
  const [editedTranscript, setEditedTranscript] = useState<string>('');
  // By default, skip speech/transcript to focus directly on visual understanding & trending metadata
  const [skipSpeech, setSkipSpeech] = useState<boolean>(true);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generatedPackage, setGeneratedPackage] = useState<AIContentPackage | null>(null);
  const [cachedContext, setCachedContext] = useState<VideoUnderstandingContext | null>(null);
  const [activeTranscript, setActiveTranscript] = useState<VideoTranscript | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{ configured: boolean; model: string } | null>(null);

  // Check Gemini health on mount
  useEffect(() => {
    aiContentService.checkHealth().then((status) => {
      setHealthStatus(status);
    });
  }, []);

  // When video changes, clear previous results & context
  useEffect(() => {
    setGeneratedPackage(null);
    setCachedContext(null);
    setActiveTranscript(null);
    setEditedTranscript('');
    setUserNotes('');
    setGenerationStep('');
  }, [selectedVideo?.id]);

  const platforms: Array<{ id: Platform; label: string; tag: string }> = [
    { id: 'tiktok', label: 'TikTok', tag: 'Dọc 9:16 · Hook viral' },
    { id: 'youtube', label: 'YouTube', tag: 'Ngang/Shorts · SEO' },
    { id: 'facebook', label: 'Facebook', tag: 'Reels/Post · Chia sẻ' },
    { id: 'instagram', label: 'Instagram', tag: 'Reels · Thẩm mỹ' },
  ];

  const purposes: Array<{ id: VideoPurpose; label: string; desc: string; icon: React.ReactNode }> = [
    {
      id: 'knowledge',
      label: 'Giáo dục & Tips',
      desc: 'Chia sẻ kiến thức, hướng dẫn thực tế',
      icon: <BookOpen className="w-3.5 h-3.5 text-indigo-400" />,
    },
    {
      id: 'entertainment',
      label: 'Giải trí & Viral',
      desc: 'Hài hước, kịch tính, thu hút giữ chân',
      icon: <Flame className="w-3.5 h-3.5 text-amber-400" />,
    },
    {
      id: 'review',
      label: 'Review & Đánh giá',
      desc: 'Trải nghiệm chân thực, ưu & nhược điểm',
      icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />,
    },
    {
      id: 'vlog',
      label: 'Vlog & Đời sống',
      desc: 'Hành trình, du lịch, cảm xúc kết nối',
      icon: <Compass className="w-3.5 h-3.5 text-sky-400" />,
    },
    {
      id: 'commercial',
      label: 'Bán hàng & Tiếp thị',
      desc: 'Nêu vấn đề, giới thiệu sản phẩm & ưu đãi',
      icon: <Store className="w-3.5 h-3.5 text-pink-400" />,
    },
    {
      id: 'news',
      label: 'Tin tức & Sự kiện',
      desc: 'Thông tin nhanh, sự kiện nóng, khách quan',
      icon: <Newspaper className="w-3.5 h-3.5 text-teal-400" />,
    },
  ];

  const tones: Array<{ id: ContentTone; label: string; desc: string; icon: React.ReactNode }> = [
    {
      id: 'strong_hook',
      label: 'Hook mạnh',
      desc: '3 giây đầu giật gân, giữ chân người xem',
      icon: <Flame className="w-3.5 h-3.5 text-amber-400" />,
    },
    {
      id: 'natural',
      label: 'Tự nhiên',
      desc: 'Thân thiện, gần gũi như trò chuyện',
      icon: <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />,
    },
    {
      id: 'genz',
      label: 'Gen Z',
      desc: 'Ngôn từ bắt trend, năng động, cuốn hút',
      icon: <Sparkles className="w-3.5 h-3.5 text-pink-400" />,
    },
    {
      id: 'professional',
      label: 'Chuyên nghiệp',
      desc: 'Uy tín, học thuật, đáng tin cậy',
      icon: <Briefcase className="w-3.5 h-3.5 text-sky-400" />,
    },
    {
      id: 'review',
      label: 'Review',
      desc: 'Đánh giá khách quan, nêu ưu nhược điểm',
      icon: <CheckCircle className="w-3.5 h-3.5 text-teal-400" />,
    },
    {
      id: 'sales',
      label: 'Bán hàng',
      desc: 'Tập trung lợi ích & thúc đẩy chuyển đổi',
      icon: <Store className="w-3.5 h-3.5 text-indigo-400" />,
    },
    {
      id: 'storytelling',
      label: 'Storytelling',
      desc: 'Dẫn dắt bằng câu chuyện chạm cảm xúc',
      icon: <BookOpen className="w-3.5 h-3.5 text-violet-400" />,
    },
  ];

  const handleGenerate = async () => {
    if (!selectedVideo) {
      onShowToast('Vui lòng chọn hoặc tải lên một video trước khi tạo nội dung.', 'error');
      return;
    }

    try {
      setIsGenerating(true);

      // Step 1: Multimodal Video Understanding (Audio Transcript + Visual Frames or Visual-first)
      let context = cachedContext;
      if (!context || context.videoPurpose !== videoPurpose || userNotes !== context.userNotes) {
        setGenerationStep(
          skipSpeech
            ? 'Đang trích xuất khung hình & xem video để bắt trend...'
            : 'Đang phân tích âm thanh & thị giác video...'
        );
        context = await aiContentService.analyzeVideo(selectedVideo, {
          transcript: skipSpeech ? undefined : (activeTranscript || undefined),
          videoPurpose,
          userNotes,
          skipTranscript: skipSpeech,
          onProgress: (stepMsg) => setGenerationStep(stepMsg),
        });
        setCachedContext(context);
        if (context.transcript && !skipSpeech) {
          setActiveTranscript(context.transcript);
        }
      } else {
        setGenerationStep('Tái sử dụng bối cảnh phân tích video từ bộ nhớ phiên...');
      }

      // Step 2: Content Generation via Gemini Multimodal with Retry & Fallback
      setGenerationStep(`Gemini AI đang kết hợp nội dung video và xu hướng hot để tạo tiêu đề, mô tả & hashtag...`);
      const req: ContentGenerationRequest = {
        videoId: selectedVideo.id,
        videoName: selectedVideo.name,
        durationSeconds: selectedVideo.metadata.duration,
        platform,
        tone,
        language,
        videoPurpose,
        userNotes,
        editedTranscript: skipSpeech ? undefined : (editedTranscript || undefined),
      };

      const result = await aiContentService.generateContentPackage(req, context);
      setGeneratedPackage(result);
      onShowToast('Đã rút ra tiêu đề, mô tả và hashtag xu hướng thành công!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Quá trình tạo nội dung gặp lỗi.';
      onShowToast(msg, 'error');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const handleRegenerate = async () => {
    if (!selectedVideo || !cachedContext) {
      handleGenerate();
      return;
    }

    try {
      setIsGenerating(true);
      setGenerationStep('Đang tạo biến thể nội dung mới...');
      const req: ContentGenerationRequest = {
        videoId: selectedVideo.id,
        videoName: selectedVideo.name,
        durationSeconds: selectedVideo.metadata.duration,
        platform,
        tone,
        language,
        videoPurpose,
        userNotes,
        editedTranscript: editedTranscript || undefined,
      };

      const result = await aiContentService.generateContentPackage(req, cachedContext);
      setGeneratedPackage(result);
      onShowToast('Đã làm mới nội dung thành công!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể làm mới nội dung.';
      onShowToast(msg, 'error');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const handleCopySingle = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onShowToast(`Đã sao chép ${label}!`, 'success');
    } catch {
      onShowToast('Không thể sao chép vào clipboard.', 'error');
    }
  };

  const handleCopyAll = async () => {
    if (!generatedPackage) return;

    const sections: string[] = [
      `【TIÊU ĐỀ VIDEO CHÍNH】\n${generatedPackage.title}`,
    ];

    if (generatedPackage.alternativeTitles && generatedPackage.alternativeTitles.length > 0) {
      sections.push(
        `【CÁC TIÊU ĐỀ BẮT TREND THAY THẾ】\n` +
          generatedPackage.alternativeTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')
      );
    }

    sections.push(
      `【HOOK 3S MỞ ĐẦU CHẶN LƯỚT】\n${generatedPackage.introduction}`,
      `【MÔ TẢ / CAPTION BẮT TREND】\n${generatedPackage.description}`,
      `【HASHTAGS THỊNH HÀNH】\n${generatedPackage.hashtags.join(' ')}`,
      `【KÊU GỌI HÀNH ĐỘNG (CTA)】\n${generatedPackage.cta}`
    );

    if (generatedPackage.trendTip) {
      sections.push(`【MẸO XU HƯỚNG & ÂM THANH】\n${generatedPackage.trendTip}`);
    }

    const fullContent = sections.join('\n\n');

    try {
      await navigator.clipboard.writeText(fullContent);
      setCopiedAll(true);
      onShowToast('Đã sao chép toàn bộ tiêu đề, mô tả và hashtag vào clipboard!', 'success');
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      onShowToast('Không thể sao chép vào clipboard.', 'error');
    }
  };

  const handleTranscriptEdited = (newFullText: string) => {
    setEditedTranscript(newFullText);
    if (cachedContext) {
      const updated = { ...cachedContext, editedTranscript: newFullText };
      setCachedContext(updated);
      aiContentService.updateCachedContext(selectedVideo?.id || '', { editedTranscript: newFullText });
    }
    onShowToast('Đã lưu transcript đã chỉnh sửa. Bấm "Tạo lại" để cập nhật kịch bản.', 'info');
  };

  const handleNotesUpdated = (notes: string) => {
    setUserNotes(notes);
    if (cachedContext) {
      const updated = { ...cachedContext, userNotes: notes };
      setCachedContext(updated);
      aiContentService.updateCachedContext(selectedVideo?.id || '', { userNotes: notes });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Model & Architecture Status Banner */}
      <div className="glass-panel-subtle flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl border border-slate-800/80 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <BrainCircuit className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Trí tuệ nhân tạo:</span>
          <strong className="text-white font-mono">Gemini Multimodal (Smart Fallback & Retry)</strong>
          <span aria-hidden="true" className="text-slate-600 hidden sm:inline">·</span>
          <span className="text-emerald-400 font-medium hidden sm:inline">Thị giác trực quan & Bắt Trend</span>
        </div>

        {healthStatus && !healthStatus.configured && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Chưa cấu hình GEMINI_API_KEY trong .env</span>
          </div>
        )}
      </div>

      {/* Configuration Box */}
      <div className="glass-panel rounded-3xl p-3.5 sm:p-5 space-y-4 shadow-xl shadow-black/40 border border-slate-800/80">
        {/* Dedicated Option: Skip Speech / Visual-First & Hot Trends */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/60 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className={`p-2 rounded-xl mt-0.5 sm:mt-0 ${skipSpeech ? 'bg-indigo-600/30 text-indigo-300' : 'bg-slate-800 text-slate-400'}`}>
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Chế độ xem video & Bắt trend siêu tốc</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Khuyên dùng
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
                Bỏ qua bóc lời thoại — AI trực tiếp quan sát các khung hình, nắm bắt chủ thể & phối hợp các xu hướng hot nhất để tạo tiêu đề, mô tả và hashtag.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 self-end sm:self-center">
            <input
              type="checkbox"
              checked={skipSpeech}
              onChange={(e) => {
                setSkipSpeech(e.target.checked);
                setCachedContext(null); // Clear cache so new choice applies
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            <span className="ml-2.5 text-xs font-semibold text-slate-200">
              {skipSpeech ? 'Đang bỏ qua lời thoại' : 'Kèm bóc lời thoại'}
            </span>
          </label>
        </div>

        {/* Row 0: Video Purpose Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
              1. Mục đích Video (Video Purpose)
            </span>
            <span className="text-[11px] text-slate-500">
              Định hướng thông điệp và kịch bản video
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {purposes.map((p) => {
              const isSelected = videoPurpose === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setVideoPurpose(p.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500/60 text-white shadow-xs'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {p.icon}
                    <span className="text-xs font-semibold">{p.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight truncate">
                    {p.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 1: Platform & Language */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-slate-800/80">
          {/* Platform Selector */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
              2. Nền tảng (Platform)
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {platforms.map((p) => {
                const isSelected = platform === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-left border text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/60 text-white shadow-xs'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold">{p.label}</div>
                    <div className="text-[10px] text-slate-500 truncate">{p.tag}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language Selector */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
              3. Ngôn ngữ kịch bản (Language)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLanguage('vi')}
                className={`min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  language === 'vi'
                    ? 'bg-indigo-600/20 border-indigo-500/60 text-white shadow-xs'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🇻🇳 Tiếng Việt</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  language === 'en'
                    ? 'bg-indigo-600/20 border-indigo-500/60 text-white shadow-xs'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🇬🇧 English</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 mt-2">
              Kịch bản được tối ưu văn phong bản địa, bắt trúng xu hướng và thuật toán.
            </p>
          </div>
        </div>

        {/* Row 2: Tone / Style */}
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
            4. Phong cách / Tông giọng (Tone & Style)
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {tones.map((t) => {
              const isSelected = tone === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTone(t.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500/60 text-white shadow-xs'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {t.icon}
                    <span className="text-xs font-semibold">{t.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight truncate">
                    {t.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions Button */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60">
          <div className="text-[11px] text-slate-400">
            {selectedVideo ? (
              <span>
                Video: <strong className="text-slate-200">{selectedVideo.name}</strong>
                {cachedContext && (
                  <span className="ml-2 text-indigo-400 font-medium">
                    (Đã phân tích bối cảnh)
                  </span>
                )}
              </span>
            ) : (
              <span className="text-amber-400/80">Chưa chọn video</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {generatedPackage && (
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleRegenerate}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>Tạo lại</span>
              </button>
            )}

            <button
              type="button"
              disabled={isGenerating || !selectedVideo}
              onClick={handleGenerate}
              className="relative group min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 shadow-xl shadow-indigo-600/35 ring-1 ring-white/20 transition-all hover:scale-[1.02] active:scale-[0.98] overflow-hidden"
            >
              <Sparkles className={`w-4 h-4 text-amber-300 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>
                {isGenerating
                  ? 'Đang quan sát & bắt trend...'
                  : skipSpeech
                  ? '⚡ Xem video & Rút tiêu đề, mô tả, hashtag xu hướng'
                  : 'Phân tích & Tạo nội dung'}
              </span>
            </button>
          </div>
        </div>

        {/* Live Processing Stage Feedback */}
        {isGenerating && generationStep && (
          <div className="p-3 bg-indigo-950/40 border border-indigo-800/40 rounded-xl flex items-center gap-2.5 text-xs text-indigo-200 animate-pulse">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
            <span>{generationStep}</span>
          </div>
        )}
      </div>

      {/* Transcript Viewer (Only shown if speech transcription is explicitly enabled and detected) */}
      {!skipSpeech && (cachedContext?.transcript?.hasSpeech || activeTranscript?.hasSpeech) && (
        <TranscriptViewer
          transcript={activeTranscript || cachedContext?.transcript}
          context={cachedContext}
          videoTitle={selectedVideo?.name}
          onSeek={onSeekVideo}
          onUpdateTranscript={handleTranscriptEdited}
          onUpdateUserNotes={handleNotesUpdated}
        />
      )}

      {/* Generated Social Media Results */}
      {generatedPackage ? (
        <div className="space-y-3.5 animate-in fade-in duration-300">
          {/* Top Bar for Results */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-white">Nội dung đề xuất:</span>
              <span className="text-slate-400 capitalize">{generatedPackage.platform}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-indigo-400 capitalize">{generatedPackage.tone}</span>
            </div>

            <button
              type="button"
              onClick={handleCopyAll}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                copiedAll
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
              }`}
            >
              {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedAll ? 'Đã sao chép tất cả!' : 'Sao chép tất cả (Tiêu đề + Caption + Hashtags)'}</span>
            </button>
          </div>

          {/* Section 1: Title & Alternative Viral Titles */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 space-y-3 transition-all hover:border-slate-700/80">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  1. Tiêu đề Viral (Title)
                </span>
                <span className="text-[11px] text-slate-500">
                  Chuẩn CTR & kích thích tò mò giữ chân người xem
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleCopySingle(generatedPackage.title, 'Tiêu đề chính')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 transition-all"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Sao chép tiêu đề</span>
              </button>
            </div>

            {/* Main Title Banner */}
            <div className="p-3 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/60 border border-indigo-500/40 rounded-xl">
              <div className="text-sm font-bold text-white leading-relaxed">
                {generatedPackage.title}
              </div>
            </div>

            {/* Alternative Titles List */}
            {generatedPackage.alternativeTitles && generatedPackage.alternativeTitles.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Các phương án giật tít bắt trend thay thế:
                </span>
                <div className="space-y-1.5">
                  {generatedPackage.alternativeTitles.map((altTitle, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 text-xs text-slate-300 transition-all group"
                    >
                      <span className="leading-snug">{altTitle}</span>
                      <button
                        type="button"
                        onClick={() => handleCopySingle(altTitle, `Tiêu đề ${idx + 1}`)}
                        className="shrink-0 p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all opacity-80 group-hover:opacity-100"
                        title="Sao chép tiêu đề này"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Introduction Hook */}
          <ContentSection
            label="2. Kịch bản mở đầu (3s Hook)"
            sublabel="Khớp với hình ảnh mở màn video để chặn lướt"
            content={generatedPackage.introduction}
            onCopyNotice={(t) => onShowToast(t, 'success')}
          />

          {/* Section 3: Description */}
          <ContentSection
            label="3. Mô tả / Caption bắt trend"
            sublabel="Bố cục thoáng, kích thích thảo luận & bình luận"
            content={generatedPackage.description}
            onCopyNotice={(t) => onShowToast(t, 'success')}
          />

          {/* Section 4: Hashtags */}
          <ContentSection
            label="4. Bộ Hashtag xu hướng (#Hashtags)"
            sublabel="Kết hợp hashtag viral triệu view và hashtag ngách chuẩn xác"
            content={generatedPackage.hashtags}
            isHashtags
            onCopyNotice={(t) => onShowToast(t, 'success')}
          />

          {/* Section 5: CTA */}
          <ContentSection
            label="5. Kêu gọi hành động (CTA)"
            sublabel="Thúc đẩy tương tác, share & follow tự nhiên"
            content={generatedPackage.cta}
            onCopyNotice={(t) => onShowToast(t, 'success')}
          />

          {/* Section 6: Trend Tip (If generated) */}
          {generatedPackage.trendTip && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-950/30 via-slate-900 to-indigo-950/30 border border-amber-500/30 flex items-start gap-3 text-xs">
              <Flame className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-amber-300">Mẹo xu hướng & Âm thanh thịnh hành:</div>
                <p className="text-slate-300 leading-relaxed">{generatedPackage.trendTip}</p>
              </div>
            </div>
          )}

          {/* Visual Insights Note */}
          {generatedPackage.sourceSummary && (
            <div className="p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl text-xs text-slate-400 flex items-start gap-2">
              <Eye className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
              <span>
                <strong>Nhận diện từ video:</strong> {generatedPackage.sourceSummary}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-dashed border-slate-800 rounded-2xl p-8 text-center bg-slate-900/30 text-slate-500 space-y-2">
          <Sparkles className="w-8 h-8 mx-auto text-indigo-400" />
          <p className="text-xs font-semibold text-slate-300">
            Bấm &ldquo;⚡ Xem video & Rút tiêu đề, mô tả, hashtag xu hướng&rdquo;
          </p>
          <p className="text-[11px] text-slate-500 max-w-md mx-auto">
            Hệ thống sẽ lấy các khung hình đại diện từ video, nhận diện các chi tiết thị giác và kết hợp với các xu hướng hot nhất hiện nay để trích xuất bộ tiêu đề, caption và hashtag chuẩn viral.
          </p>
        </div>
      )}
    </div>
  );
};
