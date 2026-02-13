import React from 'react';
import { FileText, Calendar } from 'lucide-react';

export interface DocumentIntelProps {
  documents?: {
    id: string;
    title: string;
    summary: string;
    extractedAt: string;
  }[];
  isLoading?: boolean;
}

export const DocumentIntel: React.FC<DocumentIntelProps> = ({
  documents = [],
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="p-4 text-slate-400">
        Loading documents...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500 py-4">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No documents analyzed</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {documents.map(doc => (
        <div
          key={doc.id}
          className="p-3 bg-slate-800/30 border border-white/5 rounded-lg"
        >
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{doc.title}</div>
              <div className="text-xs text-slate-400 mt-1 line-clamp-2">{doc.summary}</div>
              <div className="flex items-center gap-1 text-xs text-slate-600 mt-2">
                <Calendar className="w-3 h-3" />
                <span>
                  {new Date(doc.extractedAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
