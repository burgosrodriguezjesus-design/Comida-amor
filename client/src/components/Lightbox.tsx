import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EntryPhoto } from '@shared/types';

/** Visor de fotos a pantalla completa. */
export function Lightbox({ photos, index, onClose }: { photos: EntryPhoto[]; index: number; onClose: () => void }) {
  const [current, setCurrent] = useState(index);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setCurrent((i) => Math.min(photos.length - 1, i + 1));
      if (event.key === 'ArrowLeft') setCurrent((i) => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, photos.length]);
  const photo = photos[current];
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto de la comida"
      className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <img src={photo.url} alt="Foto de la comida" className="max-h-full max-w-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
      <button type="button" aria-label="Cerrar" onClick={onClose} className="safe-top absolute top-4 right-4 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25">
        <X size={22} />
      </button>
      {photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            disabled={current === 0}
            onClick={(e) => {
              e.stopPropagation();
              setCurrent((i) => i - 1);
            }}
            className="absolute left-3 rounded-full bg-white/15 p-2.5 text-white disabled:opacity-30"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            aria-label="Foto siguiente"
            disabled={current === photos.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              setCurrent((i) => i + 1);
            }}
            className="absolute right-3 rounded-full bg-white/15 p-2.5 text-white disabled:opacity-30"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
