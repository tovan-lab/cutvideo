import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Download,
  Edit3,
  Check,
  RotateCcw,
  Clock,
  Sparkles,
  FileText,
  Subtitles,
  Volume2,
  ChevronDown,
  Layers,
  Tag,
  Eye,
  MessageSquareQuote,
  Lightbulb,
} from 'lucide-react';
import { VideoTranscript, VideoUnderstandingContext } from '../../types/aiContent';
import { transcriptService } from '../../services/transcriptService';

interface TranscriptViewerProps {
  transcript?: VideoTranscript;
  context?: VideoUnderstandingContext | null;
  videoTitle?: string;
  onSeek?: (seconds: number) => void;
  onUpdateTranscript?: (newFullText: string) => void;
  onUpdateUserNotes?: (notes: string) => void;
}

function pad(num: number, size = 2): string {
  let s = Math.floor(num).toString();
  while (s.length < size) s = '0' + s;
  return s;
}

function formatSec(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${pad(m)}:${pad(s)}`;
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  transcript,
  context,
  videoTitle = 'video',
  onSeek,
  onUpdateTranscript,
  onUpdateUserNotes,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(transcript?.fullText || '');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [userNotes, setUserNotes] = useState(context?.userNotes || '');
  const [activeTab, setActiveTab] = useState<'transcript' | 'unified'>('transcript');

  // Sync edited text if transcript changes externally
  React.useEffect(() => {
    if (transcript?.fullText && !isEditing) {
      setEditedText(transcript.fullText);
    }
  }, [transcript?.fullText, isEditing]);

  const handleSaveEdit = () => {
    setIsEditing(false);
    onUpdateTranscript?.(editedText);
  };

  const handleResetEdit = () => {
    setEditedText(transcript?.fullText || '');
    setIsEditing(false);
    onUpdateTranscript?.(transcript?.fullText || '');
  };

  const handleDownload = (format: 'srt' | 'vtt' | 'txt') => {
    if (!transcript) return;
    setDownloadMenuOpen(false);

    // If user edited text, create a temporary transcript object for export
    const exportData: VideoTranscript = {
      ...transcript,
      fullText: editedText || transcript.fullText,
    };

    transcriptService.downloadSubtitles(exportData, format, videoTitle);
  };

  const hasSpeech = Boolean(transcript?.hasSpeech && transcript.fullText.trim().length > 0);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl transition-all">
      {/* Header bar */}
      <div className="p-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-slate-900/40">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              hasSpeech ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {hasSpeech ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Âm thanh & Lời thoại thực tế
              </h3>
              {hasSpeech ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Đã nhận diện giọng nói
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400">
                  Không phát hiện lời nói
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {transcript?.engineUsed === 'gemini-3.5-transcribe'
                ? 'Được trích xuất & chuyển ngữ bởi Gemini 3.5 Transcribe'
                : transcript?.engineUsed === 'gemini-3.8-flash'
                ? 'Được phân tích cấu trúc lời thoại bởi Gemini 3.8 Flash'
                : 'Trích xuất trực tiếp từ luồng âm thanh video'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Subtitle Download Dropdown */}
          {hasSpeech && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDownloadMenuOpen(!downloadMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-xs font-medium text-slate-200 border border-slate-700/60 transition"
                title="Tải phụ đề"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Xuất phụ đề</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {downloadMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-44 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1 z-30 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => handleDownload('srt')}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-indigo-600/30 hover:text-white flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Subtitles className="w-3.5 h-3.5 text-indigo-400" />
                      Định dạng SRT (.srt)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Chuẩn</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload('vtt')}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-indigo-600/30 hover:text-white flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-sky-400" />
                      Định dạng WebVTT (.vtt)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Web</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload('txt')}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-indigo-600/30 hover:text-white flex items-center justify-between border-t border-slate-700/60 mt-0.5 pt-1"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      Văn bản thô (.txt)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Text</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Edit Transcript Toggle */}
          {hasSpeech && (
            <button
              type="button"
              onClick={() => (isEditing ? handleSaveEdit() : setIsEditing(true))}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition ${
                isEditing
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                  : 'bg-slate-800 hover:bg-slate-700/80 text-slate-200 border-slate-700/60'
              }`}
            >
              {isEditing ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Lưu sửa đổi</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sửa transcript</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mode Sub-tabs (Transcript vs Unified Multimodal Context) */}
      <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 pt-2 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('transcript')}
          className={`pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
            activeTab === 'transcript'
              ? 'text-indigo-400 border-indigo-500'
              : 'text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          <MessageSquareQuote className="w-3.5 h-3.5" />
          <span>Lời thoại & Phân đoạn ({transcript?.segments?.length || 0})</span>
        </button>

        {context && (
          <button
            type="button"
            onClick={() => setActiveTab('unified')}
            className={`pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'unified'
                ? 'text-indigo-400 border-indigo-500'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Bối cảnh Hợp nhất (Unified Understanding)</span>
          </button>
        )}
      </div>

      {/* Main Tab Content */}
      <div className="p-4 space-y-4">
        {activeTab === 'transcript' ? (
          <div>
            {!hasSpeech ? (
              <div className="py-6 px-4 text-center rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-2">
                <MicOff className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-xs font-medium text-slate-300">
                  Video này không có giọng nói con người hoặc là video nhạc nền/video tĩnh.
                </p>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                  Gemini sẽ sử dụng các khung hình trực quan (Visual Highlights) và chuyển động để xây dựng kịch bản và nội dung phù hợp.
                </p>
              </div>
            ) : isEditing ? (
              /* Edit View */
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    Chỉnh sửa nội dung transcript để AI căn chỉnh kịch bản theo đúng ý bạn:
                  </span>
                  <button
                    type="button"
                    onClick={handleResetEdit}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-400 transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Khôi phục gốc</span>
                  </button>
                </div>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={6}
                  className="w-full bg-slate-950/80 border border-indigo-500/40 focus:border-indigo-400 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 font-mono leading-relaxed outline-none resize-none focus:ring-1 focus:ring-indigo-500/50"
                  placeholder="Nhập nội dung lời thoại..."
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Lưu transcript
                  </button>
                </div>
              </div>
            ) : (
              /* Segment List / Interactive View */
              <div className="space-y-2">
                {transcript?.segments && transcript.segments.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/40">
                    {transcript.segments.map((segment, idx) => (
                      <div
                        key={idx}
                        className="group flex items-start gap-2.5 pt-1.5 first:pt-0 hover:bg-slate-800/30 p-1.5 rounded-lg transition"
                      >
                        {/* Clickable timestamp pill */}
                        <button
                          type="button"
                          onClick={() => onSeek?.(segment.start)}
                          className="flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-md bg-indigo-950/60 hover:bg-indigo-600/40 text-[10px] font-mono text-indigo-300 border border-indigo-800/60 transition group-hover:border-indigo-500/60"
                          title="Nhấp để chuyển video đến mốc thời gian này"
                        >
                          <Clock className="w-2.5 h-2.5 text-indigo-400" />
                          <span>
                            {formatSec(segment.start)} - {formatSec(segment.end)}
                          </span>
                        </button>

                        {/* Segment text */}
                        <p className="text-xs text-slate-200 leading-snug">
                          {segment.speaker && (
                            <span className="font-semibold text-indigo-300 mr-1.5">
                              {segment.speaker}:
                            </span>
                          )}
                          {segment.text}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Fulltext fallback if no segments */
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/60 text-xs text-slate-200 leading-relaxed font-sans">
                    {transcript?.fullText}
                  </div>
                )}
              </div>
            )}

            {/* Optional Custom Notes Input for AI */}
            <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span>Ghi chú thêm cho AI khi tạo nội dung (Tùy chọn):</span>
              </label>
              <input
                type="text"
                value={userNotes}
                onChange={(e) => {
                  setUserNotes(e.target.value);
                  onUpdateUserNotes?.(e.target.value);
                }}
                placeholder="Ví dụ: 'Nhấn mạnh chương trình giảm giá 20%', 'Dùng giọng điệu hào hứng',..."
                className="w-full bg-slate-950/70 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none transition"
              />
            </div>
          </div>
        ) : (
          /* Unified Multimodal Context Tab */
          context && (
            <div className="space-y-3.5">
              {/* Summary */}
              <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-900/40 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Bản tóm tắt hợp nhất (Visual + Transcript):</span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">{context.summary}</p>
              </div>

              {/* Grid of details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Visual Highlights */}
                {context.visualHighlights && context.visualHighlights.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Eye className="w-3 h-3 text-sky-400" />
                      Chi tiết thị giác
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {context.visualHighlights.map((v, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-slate-800/80 text-[10px] text-slate-300 font-medium"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Spoken Topics */}
                {context.spokenTopics && context.spokenTopics.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Volume2 className="w-3 h-3 text-emerald-400" />
                      Chủ đề trong lời nói
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {context.spokenTopics.map((t, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-emerald-950/40 text-[10px] text-emerald-300 font-medium border border-emerald-800/40"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Key Moments with clickable seek */}
              {context.keyMoments && context.keyMoments.length > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    Khoảnh khắc then chốt (Key Moments)
                  </span>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {context.keyMoments.map((km, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 hover:bg-slate-800/40 p-1 rounded-lg transition"
                      >
                        <button
                          type="button"
                          onClick={() => onSeek?.(km.timestampSec)}
                          className="px-1.5 py-0.5 rounded bg-amber-950/60 hover:bg-amber-600/40 text-[10px] font-mono text-amber-300 border border-amber-800/60 transition"
                          title="Chuyển đến mốc thời gian này"
                        >
                          {formatSec(km.timestampSec)}
                        </button>
                        <span className="text-xs text-slate-300">{km.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* On-screen text if detected */}
              {context.onScreenText && context.onScreenText.length > 0 && (
                <div className="p-2 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300 mr-1">Chữ trên màn hình:</span>
                  {context.onScreenText.join(' · ')}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
};
