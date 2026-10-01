/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState } from 'react';
import { OutputQuality, VideoItem } from './types/video';
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { Background3D } from './components/layout/Background3D';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { QualityModal, AboutModal } from './components/common/Modals';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { VideoToolsPage } from './pages/VideoToolsPage';
import { AIContentPage } from './pages/AIContentPage';
import type { AppTab } from './types/studio';

// Tải riêng khi mở tab để Three.js không làm nặng lần tải trang đầu.
const StudioPage = lazy(() => import('./pages/StudioPage'));

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('video');
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [outputQuality, setOutputQuality] = useState<OutputQuality>('original');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

  const showToast = (
    title: string,
    type: 'success' | 'error' | 'info' = 'info',
    description?: string
  ) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, type, description }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ErrorBoundary>
      <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600/30 selection:text-white overflow-x-hidden">
        {/* 3D Animated Cosmic Background */}
        <Background3D />
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
          outputQuality={outputQuality}
          onOpenQualityModal={() => setIsQualityModalOpen(true)}
          onOpenAboutModal={() => setIsAboutModalOpen(true)}
        />

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5">
          <ErrorBoundary fallbackTitle="Không thể tải nội dung trang">
            {activeTab === 'studio' ? (
              <Suspense
                fallback={<div className="py-24 text-center text-sm text-slate-400">Đang tải Xưởng Nội Dung…</div>}
              >
                <StudioPage onShowToast={showToast} onJumpToVideo={() => setActiveTab('video')} />
              </Suspense>
            ) : activeTab === 'video' ? (
              <VideoToolsPage
                currentVideo={currentVideo}
                onSelectVideo={setCurrentVideo}
                outputQuality={outputQuality}
                onChangeQuality={setOutputQuality}
                onShowToast={showToast}
                onJumpToAI={() => setActiveTab('ai')}
              />
            ) : (
              <AIContentPage
                currentVideo={currentVideo}
                onSelectVideo={setCurrentVideo}
                onShowToast={showToast}
              />
            )}
          </ErrorBoundary>
        </main>

        {/* Mobile Bottom Tab Bar */}
        <MobileNav
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
          outputQuality={outputQuality}
          onOpenQualityModal={() => setIsQualityModalOpen(true)}
        />

        {/* Modals & Overlays */}
        <QualityModal
          isOpen={isQualityModalOpen}
          onClose={() => setIsQualityModalOpen(false)}
          quality={outputQuality}
          onSelectQuality={(q) => {
            setOutputQuality(q);
            showToast(`Đã chọn chất lượng xuất: ${q === 'original' ? 'Gốc (Max)' : q}`, 'success');
          }}
        />

        <AboutModal
          isOpen={isAboutModalOpen}
          onClose={() => setIsAboutModalOpen(false)}
        />

        {/* Global Toast Container */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </ErrorBoundary>
  );
}
