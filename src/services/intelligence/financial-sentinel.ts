import type { Signal, AnticipationContext } from '../../types/signals';
import { v4 as uuid } from 'uuid';

/**
 * Financial Sentinel — monitors portfolio data and deal pipeline for financial signals
 *
 * Detection logic:
 * - Portfolio alerts: checks Alpaca day P&L for losses and equity changes
 * - Deal pipeline: monitors stale deals and under-contract deals needing analysis
 */
export function detectFinancialSignals(context: AnticipationContext): Signal[] {
  const signals: Signal[] = [];

  // Check portfolio data from Alpaca MCP
  if (context.mcpData.alpaca) {
    const { dayPnl, equity, positions } = context.mcpData.alpaca;

    // Critical alert: large portfolio loss
    if (dayPnl < -500) {
      signals.push({
        id: uuid(),
        type: 'portfolio_alert',
        severity: 'critical',
        domain: 'finance',
        source: 'financial-sentinel',
        title: `Critical Portfolio Loss: $${Math.abs(dayPnl).toFixed(2)}`,
        context: `Day P&L is $${dayPnl.toFixed(2)} with ${positions.length} active positions. Equity: $${equity.toFixed(2)}`,
        suggested_action: 'Review positions immediately and consider risk management actions',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      });
    }
    // Urgent alert: moderate portfolio loss
    else if (dayPnl < -100) {
      signals.push({
        id: uuid(),
        type: 'portfolio_alert',
        severity: 'urgent',
        domain: 'finance',
        source: 'financial-sentinel',
        title: `Portfolio Loss: $${Math.abs(dayPnl).toFixed(2)}`,
        context: `Day P&L is $${dayPnl.toFixed(2)} with ${positions.length} active positions. Equity: $${equity.toFixed(2)}`,
        suggested_action: 'Review underperforming positions',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: new Date().toISOString(),
      });
    }

    // Note: We could add equity change detection here if we had historical data
    // For now, focusing on day P&L as the primary signal
  }

  // Check real estate deal pipeline
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  context.deals.forEach((deal) => {
    // Skip closed or dead deals
    if (deal.status === 'closed' || deal.status === 'dead') {
      return;
    }

    // Only check deals with a last_analysis_at timestamp
    if (!deal.last_analysis_at) {
      return;
    }

    const lastAnalysis = new Date(deal.last_analysis_at).getTime();
    const daysSinceAnalysis = Math.floor((now - lastAnalysis) / (24 * 60 * 60 * 1000));

    if (now - lastAnalysis > SEVEN_DAYS) {
      // Urgent: under-contract deals get higher priority
      if (deal.status === 'under_contract') {
        signals.push({
          id: uuid(),
          type: 'deal_update',
          severity: 'urgent',
          domain: 'business_re',
          source: 'financial-sentinel',
          title: `Under-Contract Deal Needs Analysis: ${deal.address}`,
          context: `Deal under contract for ${daysSinceAnalysis} days without fresh analysis. Due diligence period may be ending.`,
          suggested_action: 'Update analysis and verify all contingencies are complete',
          auto_actionable: false,
          is_dismissed: false,
          is_acted_on: false,
          related_entity_ids: [deal.id],
          created_at: new Date().toISOString(),
        });
      } else {
        // Attention: stale deals in other statuses
        signals.push({
          id: uuid(),
          type: 'deal_update',
          severity: 'attention',
          domain: 'business_re',
          source: 'financial-sentinel',
          title: `Stale Deal: ${deal.address}`,
          context: `Deal has been in ${deal.status} status for ${daysSinceAnalysis} days without analysis. Strategy: ${deal.strategy}`,
          suggested_action: 'Run fresh comps and update deal analysis',
          auto_actionable: false,
          is_dismissed: false,
          is_acted_on: false,
          related_entity_ids: [deal.id],
          created_at: new Date().toISOString(),
        });
      }
    }
  });

  return signals;
}
