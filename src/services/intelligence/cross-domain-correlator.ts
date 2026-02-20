import type { Signal, AnticipationContext, LifeDomain } from '../../types/signals';
import { v4 as uuid } from 'uuid';

/**
 * Cross-Domain Correlator — finds correlations between signals across different life domains
 *
 * Detection logic:
 * - Domain overload: 3+ signals in one domain → pattern_insight about domain concentration
 * - Financial cross-correlation: signals in both business_re and finance → financial_update
 * - Work-life balance: signals in family + business_* → context_switch_prep about balance
 */
export function detectCrossDomainSignals(context: AnticipationContext): Signal[] {
  const signals: Signal[] = [];

  // Early return if no existing signals to correlate
  if (context.signals.length === 0) {
    return signals;
  }

  // Group signals by domain
  const signalsByDomain = new Map<LifeDomain, Signal[]>();

  context.signals.forEach((signal) => {
    const existing = signalsByDomain.get(signal.domain) || [];
    existing.push(signal);
    signalsByDomain.set(signal.domain, existing);
  });

  // Detect domain overload (3+ signals in one domain)
  signalsByDomain.forEach((domainSignals, domain) => {
    if (domainSignals.length >= 3) {
      const severities = domainSignals.map(s => s.severity).join(', ');
      signals.push({
        id: uuid(),
        type: 'pattern_insight',
        severity: 'attention',
        domain,
        source: 'cross-domain-correlator',
        title: `Domain Overload: ${domain}`,
        context: `${domainSignals.length} signals detected in ${domain} domain (severities: ${severities}). This domain may need focused attention.`,
        suggested_action: `Block time to address ${domain} items systematically`,
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: domainSignals.map(s => s.id),
        created_at: new Date().toISOString(),
      });
    }
  });

  // Detect business_re + finance cross-correlation
  const hasBusinessRE = signalsByDomain.has('business_re');
  const hasFinance = signalsByDomain.has('finance');

  if (hasBusinessRE && hasFinance) {
    const reSignals = signalsByDomain.get('business_re') || [];
    const financeSignals = signalsByDomain.get('finance') || [];

    signals.push({
      id: uuid(),
      type: 'financial_update',
      severity: 'attention',
      domain: 'business_re',
      source: 'cross-domain-correlator',
      title: 'Real Estate + Finance Activity Detected',
      context: `${reSignals.length} real estate signal(s) and ${financeSignals.length} finance signal(s) active. Deal pipeline and portfolio both need attention.`,
      suggested_action: 'Review cash flow availability for real estate deals given portfolio status',
      auto_actionable: false,
      is_dismissed: false,
      is_acted_on: false,
      related_entity_ids: [...reSignals.map(s => s.id), ...financeSignals.map(s => s.id)],
      created_at: new Date().toISOString(),
    });
  }

  // Detect family + business work-life balance signal
  const hasFamily = signalsByDomain.has('family');
  const businessDomains: LifeDomain[] = ['business_re', 'business_trading', 'business_tech'];
  const activeBusinessDomains = businessDomains.filter(d => signalsByDomain.has(d));

  if (hasFamily && activeBusinessDomains.length > 0) {
    const familySignals = signalsByDomain.get('family') || [];
    const businessSignals = activeBusinessDomains.flatMap(d => signalsByDomain.get(d) || []);

    signals.push({
      id: uuid(),
      type: 'context_switch_prep',
      severity: 'attention',
      domain: 'family',
      source: 'cross-domain-correlator',
      title: 'Work-Life Balance: Family + Business Activity',
      context: `${familySignals.length} family signal(s) and ${businessSignals.length} business signal(s) across ${activeBusinessDomains.join(', ')}. Context switching may be needed.`,
      suggested_action: 'Plan transition time between family and business responsibilities',
      auto_actionable: false,
      is_dismissed: false,
      is_acted_on: false,
      related_entity_ids: [...familySignals.map(s => s.id), ...businessSignals.map(s => s.id)],
      created_at: new Date().toISOString(),
    });
  }

  return signals;
}
