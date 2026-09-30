import React, { useRef } from 'react';
import { TextOverlayItem } from '../../types/video';

interface TextOverlayCanvasProps {
  items: TextOverlayItem[];
  selectedId: string | null;
  onSelectItem: (id: string) => void;
  onUpdateItemPosition: (id: string, x: number, y: number) => void;
  currentTime: number;
  totalDuration: number;
}

export const TextOverlayCanvas: React.FC<TextOverlayCanvasProps> = ({
  items,
  selectedId,
  onSelectItem,
  onUpdateItemPosition,
  currentTime,
  totalDuration,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    onSelectItem(id);
    isDraggingRef.current = true;
    draggingIdRef.current = id;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !draggingIdRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    const xPct = Math.max(5, Math.min(95, Math.round((xPx / rect.width) * 100)));
    const yPct = Math.max(5, Math.min(95, Math.round((yPx / rect.height) * 100)));

    onUpdateItemPosition(draggingIdRef.current, xPct, yPct);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      draggingIdRef.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="absolute inset-0 w-full h-full pointer-events-auto select-none overflow-hidden"
    >
      {items.map((item) => {
        // Check visibility at currentTime
        const isVisible =
          item.fullDuration ||
          (currentTime >= item.startTime && currentTime <= item.endTime);

        if (!isVisible) return null;

        const isSelected = selectedId === item.id;
        const opacityVal = (item.opacity ?? 100) / 100;

        // Position coordinates
        let posX = item.x;
        let posY = item.y;

        if (item.positionPreset === 'top') {
          posX = 50;
          posY = 10;
        } else if (item.positionPreset === 'center') {
          posX = 50;
          posY = 50;
        } else if (item.positionPreset === 'lower_third') {
          posX = 50;
          posY = 75;
        } else if (item.positionPreset === 'bottom') {
          posX = 50;
          posY = 88;
        }

        // Animation calculations based on time difference from startTime
        const timeFromStart = Math.max(0, currentTime - item.startTime);
        const timeToEnd = Math.max(0, item.endTime - currentTime);
        const animDuration = item.animationDuration || 0.4;

        let animStyle: React.CSSProperties = {};

        if (item.animation === 'fade') {
          let alpha = 1;
          if (timeFromStart < animDuration) {
            alpha = timeFromStart / animDuration;
          } else if (!item.fullDuration && timeToEnd < animDuration) {
            alpha = timeToEnd / animDuration;
          }
          animStyle.opacity = alpha * opacityVal;
        } else if (item.animation === 'slide_up') {
          const progress = Math.min(1, timeFromStart / animDuration);
          const translateY = (1 - progress) * 30;
          animStyle.transform = `translate(-50%, calc(-50% + ${translateY}px))`;
        } else if (item.animation === 'slide_left') {
          const progress = Math.min(1, timeFromStart / animDuration);
          const translateX = (1 - progress) * 40;
          animStyle.transform = `translate(calc(-50% + ${translateX}px), -50%)`;
        } else if (item.animation === 'zoom_in') {
          const progress = Math.min(1, timeFromStart / animDuration);
          const scale = 0.5 + 0.5 * progress;
          animStyle.transform = `translate(-50%, -50%) scale(${scale})`;
        } else if (item.animation === 'bounce') {
          const progress = Math.min(1, timeFromStart / animDuration);
          const bounceScale = progress < 0.6 ? 1 + progress * 0.4 : 1.24 - (progress - 0.6) * 0.6;
          animStyle.transform = `translate(-50%, -50%) scale(${bounceScale})`;
        } else {
          animStyle.transform = 'translate(-50%, -50%)';
        }

        // Typewriter effect simulation
        let displayText = item.isUppercase ? item.text.toUpperCase() : item.text;
        if (item.animation === 'typewriter' && !item.fullDuration) {
          const totalAnimTime = Math.min(2.0, (item.endTime - item.startTime) * 0.7);
          const charFraction = Math.min(1, timeFromStart / totalAnimTime);
          const charsToShow = Math.ceil(displayText.length * charFraction);
          displayText = displayText.slice(0, charsToShow);
        }

        // Text Shadow CSS
        let textShadowStyle: string | undefined = undefined;
        if (item.shadowEnabled) {
          textShadowStyle = `2px 2px ${item.shadowBlur || 4}px ${item.shadowColor || '#000000'}`;
        }

        // Stroke CSS (-webkit-text-stroke)
        const textStrokeStyle = item.strokeEnabled
          ? `${item.strokeWidth || 2}px ${item.strokeColor || '#000000'}`
          : undefined;

        // Box styling
        const boxBg = item.boxEnabled
          ? `${item.boxColor || '#000000'}${Math.round(((item.boxOpacity ?? 80) / 100) * 255)
              .toString(16)
              .padStart(2, '0')}`
          : 'transparent';

        return (
          <div
            key={item.id}
            onPointerDown={(e) => handlePointerDown(e, item.id)}
            style={{
              left: `${posX}%`,
              top: `${posY}%`,
              opacity: item.animation === 'fade' ? animStyle.opacity : opacityVal,
              transform: animStyle.transform || 'translate(-50%, -50%)',
              fontFamily: item.fontFamily,
              fontWeight: item.isBold ? 800 : 500,
              fontStyle: item.isItalic ? 'italic' : 'normal',
              textAlign: item.textAlign,
            }}
            className={`absolute cursor-move select-none transition-shadow ${
              isSelected ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-black/80 rounded-xl' : ''
            }`}
          >
            <div
              style={{
                backgroundColor: boxBg,
                padding: item.boxEnabled ? `${item.boxPadding || 8}px ${item.boxPadding ? item.boxPadding * 1.5 : 12}px` : '4px 6px',
                borderRadius: `${item.boxRadius ?? 8}px`,
                color: item.textColor || '#ffffff',
                fontSize: `${item.fontSize || 28}px`,
                lineHeight: 1.25,
                textShadow: textShadowStyle,
                WebkitTextStroke: textStrokeStyle,
              }}
              className="whitespace-pre-wrap font-sans transition-all"
            >
              {displayText || 'Nhập văn bản...'}
            </div>

            {/* Selection Drag Badge */}
            {isSelected && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-indigo-600 text-[10px] font-mono font-medium text-white shadow-md pointer-events-none whitespace-nowrap">
                Kéo để đổi vị trí ({posX}%, {posY}%)
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
