import React, { useState, useMemo } from 'react';
import { BookOpen, Search, Clock } from 'lucide-react';

export interface KnowledgeBaseProps {
  pages?: {
    id: string;
    title: string;
    updatedAt: string;
    preview: string;
  }[];
  isLoading?: boolean;
}

export const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({
  pages = [],
  isLoading = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return pages;

    const query = searchQuery.toLowerCase();
    return pages.filter(page =>
      page.title.toLowerCase().includes(query)
    );
  }, [pages, searchQuery]);

  if (isLoading) {
    return (
      <div className="p-4 text-slate-400">
        Loading knowledge base...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search pages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-slate-800/30 border border-white/5 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>

      {/* Pages list */}
      {filteredPages.length === 0 ? (
        <div className="text-center text-slate-500 py-4">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            {searchQuery.trim() ? 'No matching pages found' : 'No knowledge base entries'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPages.map(page => (
            <div
              key={page.id}
              className="p-3 bg-slate-800/30 border border-white/5 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-2">
                <BookOpen className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{page.title}</div>
                  <div className="text-xs text-slate-400 mt-1 line-clamp-2">{page.preview}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-600 mt-2">
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Date(page.updatedAt).toLocaleDateString([], {
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
      )}
    </div>
  );
};
