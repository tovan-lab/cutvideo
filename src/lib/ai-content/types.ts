export type SEOPlatform = 'youtube_long' | 'youtube_shorts' | 'tiktok' | 'facebook' | 'instagram';

export type TitleTone = 'professional' | 'curiosity' | 'numbers' | 'natural';

export interface EntityFact {
  name: string;
  type: string;
}

export interface NumberAndFact {
  fact: string;
  timestamp?: string;
}

export interface TranscriptSnippet {
  start: number;
  text: string;
}

export interface VideoChapter {
  start: string; // e.g. "00:00"
  title: string;
}

export type VideoType = 'nội dung chính' | 'intro' | 'màn hình kết thúc' | 'quảng cáo' | 'khác';

export interface VideoFacts {
  summary: string;
  main_topic: string;
  sub_topics: string[];
  entities: EntityFact[];
  numbers_and_facts: NumberAndFact[];
  on_screen_text: string[];
  transcript: TranscriptSnippet[];
  chapters: VideoChapter[];
  video_type: VideoType;
  duration_sec: number;
  orientation: string;
  is_low_information?: boolean;
  confidence_note?: string;
}

export interface MatchDetail {
  claim: string;
  supported: boolean;
  timestamp?: string;
  reason?: string;
}

export interface PlatformSEOItem {
  platform: SEOPlatform;
  titles: string[]; // exactly 3 options
  selectedTitleIndex: number;
  description: string;
  hashtags: string[];
  tags: string[]; // for YouTube (10-15 tags, total <= 500 chars)
  primary_keyword: string;
  keyword_sources: Record<string, string>;
  match_score: number; // percentage 0-100%
  match_details: MatchDetail[];
}

export interface KeywordScoreItem {
  keyword: string;
  score: number;
  sources: string[];
  relevance_note?: string;
}

export interface KeywordResearchResult {
  seed_keywords: string[];
  youtube_suggestions: string[];
  google_suggestions: string[];
  trending_tags: string[];
  scored_keywords: KeywordScoreItem[];
}

export interface SEOContentPackage {
  videoFacts: VideoFacts;
  platforms: Partial<Record<SEOPlatform, PlatformSEOItem>>;
  selectedPlatforms: SEOPlatform[];
  keywordResearch: KeywordResearchResult;
  channelName?: string;
  primaryKeyword?: string;
  userContext?: string;
  titleTone: TitleTone;
  includeTranscript: boolean;
  generatedAt: number;
}

export interface AIContentSEOProgress {
  step: 'reading_video' | 'researching_keywords' | 'writing_content' | 'checking_facts' | 'done' | 'error';
  message: string;
  percent: number;
}
