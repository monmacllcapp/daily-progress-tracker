import { useRef, useState } from 'react';
import { Upload, FileText, File, Download, X } from 'lucide-react';
import type { MissionAttachment } from '../../types/schema';
import { useRxQuery } from '../../hooks/useRxQuery';
import { useDatabase } from '../../hooks/useDatabase';

interface FileAttachmentZoneProps {
  missionId: string;
}

async function generateThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(200 / img.width, 200 / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachmentZone({ missionId }: FileAttachmentZoneProps) {
  const [db] = useDatabase();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [attachments] = useRxQuery<MissionAttachment>(db?.mission_attachments, {
    selector: { mission_id: missionId },
  });

  async function processFile(file: File) {
    if (!db) return;

    // Large file confirmation
    if (file.size > 5 * 1024 * 1024) {
      const ok = window.confirm(`"${file.name}" is over 5 MB (${formatSize(file.size)}). Continue?`);
      if (!ok) return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const dataBase64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(reader.error);
      });

      let thumbnailBase64: string | undefined;
      if (file.type.startsWith('image/')) {
        thumbnailBase64 = await generateThumbnail(file);
      }

      await db.mission_attachments.insert({
        id: crypto.randomUUID(),
        mission_id: missionId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        data_base64: dataBase64,
        thumbnail_base64: thumbnailBase64,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[FileAttachmentZone] upload failed:', err);
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      await processFile(file);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files).catch(console.error);
  }

  function downloadAttachment(att: MissionAttachment) {
    const binary = atob(att.data_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: att.file_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.file_name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function removeAttachment(id: string) {
    if (!db) return;
    const doc = await db.mission_attachments.findOne(id).exec();
    await doc?.remove();
  }

  function getFileIcon(fileType: string) {
    if (fileType.startsWith('image/')) return null; // uses thumbnail
    if (fileType.includes('pdf') || fileType.includes('document') || fileType.includes('text')) {
      return <FileText className="w-8 h-8 text-blue-400 flex-shrink-0" />;
    }
    return <File className="w-8 h-8 text-slate-400 flex-shrink-0" />;
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'relative flex flex-col items-center justify-center gap-2 p-6',
          'border-2 border-dashed rounded-xl cursor-pointer transition-all duration-150',
          dragging
            ? 'border-cyan-500 bg-cyan-500/10 scale-[1.01]'
            : 'border-slate-600 hover:border-slate-500 bg-slate-900/50 hover:bg-slate-900',
        ].join(' ')}
      >
        <Upload className={`w-6 h-6 ${dragging ? 'text-cyan-400' : 'text-slate-400'}`} />
        <p className="text-sm text-slate-400">
          {uploading ? 'Uploading…' : 'Drop files here or click to browse'}
        </p>
        <p className="text-xs text-slate-600">Any file type · Large files require confirmation</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files).catch(console.error)}
        />
      </div>

      {uploadError && (
        <p className="text-xs text-rose-400 flex items-center gap-1">
          <X className="w-3 h-3" /> {uploadError}
        </p>
      )}

      {/* Attachment list */}
      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-3 bg-slate-900 border border-white/5 rounded-lg px-3 py-2"
            >
              {/* Thumbnail or icon */}
              {att.thumbnail_base64 ? (
                <img
                  src={`data:image/jpeg;base64,${att.thumbnail_base64}`}
                  alt={att.file_name}
                  className="w-10 h-10 object-cover rounded flex-shrink-0"
                />
              ) : (
                getFileIcon(att.file_type)
              )}

              {/* Name + size */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{att.file_name}</p>
                <p className="text-[10px] text-slate-500">{formatSize(att.file_size)}</p>
              </div>

              {/* Download */}
              <button
                onClick={() => downloadAttachment(att)}
                title="Download"
                className="p-1 text-slate-400 hover:text-cyan-400 transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* Remove */}
              <button
                onClick={() => removeAttachment(att.id).catch(console.error)}
                title="Remove"
                className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
