import { Camera, ImagePlus, LoaderCircle, X } from 'lucide-react';
import { useRef } from 'react';
import { LIMITS } from '@shared/constants';
import type { EntryPhoto } from '@shared/types';
import { api, errorMessage } from '@/api/client';
import { useFeedback } from '@/context/Feedback';
import { newKey, type DraftPhoto } from '@/lib/draft';
import { prepareImage } from '@/lib/image';

/** Fotos opcionales: se reducen en el dispositivo y se suben al momento. */
export function PhotoPicker({
  photos,
  onChange,
  onUploaded,
}: {
  photos: DraftPhoto[];
  onChange: (update: (photos: DraftPhoto[]) => DraftPhoto[]) => void;
  onUploaded: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useFeedback();

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const available = LIMITS.photosPerEntry - photos.length;
    const list = Array.from(files).slice(0, Math.max(0, available));
    if (files.length > available) toast({ message: `Puedes añadir hasta ${LIMITS.photosPerEntry} fotos por registro.`, tone: 'error' });
    for (const file of list) {
      const key = newKey();
      const localUrl = URL.createObjectURL(file);
      onChange((current) => [...current, { key, localUrl, uploading: true }]);
      try {
        const prepared = await prepareImage(file);
        const form = new FormData();
        form.append('width', String(prepared.width));
        form.append('height', String(prepared.height));
        form.append('photo', prepared.full, 'foto.jpg');
        form.append('thumb', prepared.thumb, 'miniatura.jpg');
        const { photo } = await api.post<{ photo: EntryPhoto }>('/api/photos', form);
        onUploaded(photo.id);
        onChange((current) => current.map((p) => (p.key === key ? { ...p, ...photo, uploading: false } : p)));
      } catch (error) {
        toast({ message: errorMessage(error), tone: 'error' });
        onChange((current) => current.filter((p) => p.key !== key));
        URL.revokeObjectURL(localUrl);
      }
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {photos.map((photo) => (
          <div key={photo.key} className="relative h-24 w-24 overflow-hidden rounded-2xl bg-surface-2">
            <img src={photo.localUrl ?? photo.thumbUrl} alt="Foto de la comida" className="h-full w-full object-cover" />
            {photo.uploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
                <LoaderCircle className="animate-spin" size={22} aria-label="Subiendo foto" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onChange((current) => current.filter((p) => p.key !== photo.key))}
                aria-label="Quitar foto"
                className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ))}
        {photos.length < LIMITS.photosPerEntry && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong text-ink-2 transition-colors hover:border-brand hover:text-brand"
          >
            {photos.length === 0 ? <Camera size={22} aria-hidden="true" /> : <ImagePlus size={22} aria-hidden="true" />}
            <span className="text-xs font-semibold">{photos.length === 0 ? 'Añadir foto' : 'Otra foto'}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
