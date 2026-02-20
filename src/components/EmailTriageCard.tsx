import React, { useState, useEffect, useMemo } from 'react';
import { Mail, Archive, ExternalLink, RefreshCw } from 'lucide-react';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';
import { Link } from 'react-router-dom';
import { isGoogleConnected, requestGoogleAuth } from '../services/google-auth';
import { syncGmailInbox, archiveMessage } from '../services/gmail';
import { classifyEmail } from '../services/email-classifier';
import type { Email } from '../types/schema';

interface EmailTriageCardProps {
  onTriageComplete?: () => void;
}

export function EmailTriageCard({ onTriageComplete }: EmailTriageCardProps) {
  const [db] = useDatabase();
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Check Google connection on mount
  useEffect(() => {
    setIsConnected(isGoogleConnected());
  }, []);

  // Query emails from DB (non-archived, non-snoozed, sorted by received date desc)
  const [emails, loading] = useRxQuery<Email>(
    db?.emails,
    {
      selector: {
        status: { $nin: ['archived', 'snoozed', 'replied'] }
      },
      sort: [{ received_at: 'desc' }]
    }
  );

  // Group by tier priority
  const { urgent, needsReply, total } = useMemo(() => {
    if (!emails) return { urgent: [], needsReply: [], total: 0 };
    const u = emails.filter(e => (e.tier_override || e.tier) === 'reply_urgent');
    const nr = emails.filter(e => (e.tier_override || e.tier) === 'reply_needed');
    return { urgent: u, needsReply: nr, total: emails.length };
  }, [emails]);

  // Sync Gmail
  const handleSync = async () => {
    if (!db) return;
    setIsSyncing(true);
    try {
      await syncGmailInbox(db, classifyEmail);
    } catch (err) {
      console.error('[EmailTriage] Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Archive email
  const handleArchive = async (email: Email) => {
    if (!db) return;
    try {
      // Archive in Gmail if connected
      if (isConnected) {
        await archiveMessage(email.gmail_id);
      }
      // Update local DB
      const doc = await db.emails.findOne(email.id).exec();
      if (doc) {
        await doc.patch({ status: 'archived', updated_at: new Date().toISOString() });
      }
    } catch (err) {
      console.error('[EmailTriage] Archive failed:', err);
    }
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <Mail className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400 mb-4">Connect Gmail to triage your inbox</p>
        <button
          onClick={async () => {
            try {
              await requestGoogleAuth();
              setIsConnected(true);
            } catch (err) {
              console.error('Google connect failed:', err);
            }
          }}
          className="bg-blue-500/20 border border-blue-500/50 text-blue-400 px-6 py-3 rounded-lg hover:bg-blue-500/30 transition-colors"
        >
          Connect Gmail
        </button>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mr-3" />
        <span className="text-slate-400">Loading emails...</span>
      </div>
    );
  }

  // Render email row
  const renderEmailRow = (email: Email) => {
    const fromName = email.from.split('<')[0].trim() || email.from;

    return (
      <div
        key={email.id}
        className="flex items-center gap-3 py-3 px-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{fromName}</div>
          <div className="text-xs text-slate-400 truncate">{email.subject}</div>
        </div>
        <button
          onClick={() => handleArchive(email)}
          className="p-2 text-slate-500 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
          title="Archive"
        >
          <Archive className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          {urgent.length > 0 && (
            <span className="text-red-400 font-medium">{urgent.length} urgent</span>
          )}
          {needsReply.length > 0 && (
            <span className="text-yellow-400 font-medium">{needsReply.length} need reply</span>
          )}
          <span className="text-slate-500">{total} total in inbox</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-50"
            title="Sync Gmail"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/email"
            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            Open Email <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Urgent emails */}
      {urgent.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">Urgent</h4>
          <div className="space-y-2">
            {urgent.slice(0, 5).map(renderEmailRow)}
          </div>
        </div>
      )}

      {/* Needs reply */}
      {needsReply.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-yellow-400 mb-2">Needs Reply</h4>
          <div className="space-y-2">
            {needsReply.slice(0, 5).map(renderEmailRow)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {urgent.length === 0 && needsReply.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No urgent emails. Inbox is under control!</p>
        </div>
      )}
    </div>
  );
}
