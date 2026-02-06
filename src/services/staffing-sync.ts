import type { TitanDatabase } from '../db';
import type { StaffPayPeriod } from '../types/schema';
import { isHubstaffConnected, fetchDailyActivities, mapHubstaffToStaff } from './hubstaff';
import { recomputeKpiSummary } from './staffing-data';

const SYNC_KEY = 'hubstaff_last_sync';

export function getLastSyncTime(): string | null {
  return localStorage.getItem(SYNC_KEY);
}

function getCurrentPayPeriod(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

export async function syncHubstaffHours(db: TitanDatabase): Promise<{
  synced: number;
  errors: string[];
}> {
  if (!isHubstaffConnected()) {
    return { synced: 0, errors: ['Hubstaff PAT not configured'] };
  }

  const result = { synced: 0, errors: [] as string[] };

  try {
    // 1. Get current pay period bounds
    const { start, end } = getCurrentPayPeriod();
    const month = start.substring(0, 7);

    // 2. Map Hubstaff users to staff members
    const mapping = await mapHubstaffToStaff(db);
    if (mapping.size === 0) {
      return { synced: 0, errors: ['No Hubstaff users matched to staff members. Link them in staff settings.'] };
    }

    // 3. Fetch daily activities for the period
    const userIds = Array.from(mapping.keys());
    const activities = await fetchDailyActivities(start, end, userIds);

    // 4. Aggregate per user
    const userAgg = new Map<number, { totalSecs: number; totalActivity: number; days: number }>();
    for (const act of activities) {
      const curr = userAgg.get(act.user_id) || { totalSecs: 0, totalActivity: 0, days: 0 };
      curr.totalSecs += act.tracked;
      curr.totalActivity += act.overall;
      curr.days += 1;
      userAgg.set(act.user_id, curr);
    }

    // 5. Upsert pay periods for each mapped user
    for (const [userId, staff] of mapping) {
      const agg = userAgg.get(userId);
      if (!agg) continue;

      const hoursWorked = Math.round((agg.totalSecs / 3600) * 100) / 100;
      const activityPct = agg.totalSecs > 0 ? Math.round((agg.totalActivity / agg.totalSecs) * 100) : 0;
      const basePay = staff.pay_type === 'hourly'
        ? Math.round(hoursWorked * staff.base_rate * 100) / 100
        : staff.base_rate;

      const dedupId = `${staff.id}_${start}`;

      // Get existing record to preserve manual data
      const existing = await db.staff_pay_periods.findOne(dedupId).exec();
      const existingData = existing ? existing.toJSON() as StaffPayPeriod : null;

      const payPeriod: StaffPayPeriod = {
        ...(existingData || {}),
        id: dedupId,
        staff_id: staff.id,
        period_start: start,
        period_end: end,
        hours_worked: hoursWorked,
        activity_pct: activityPct,
        base_pay: basePay,
        total_pay: basePay + (existingData?.bonus || 0) + (existingData?.holiday_pay || 0) + (existingData?.commission || 0),
        is_paid: existingData?.is_paid || false,
        hubstaff_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_at: existingData?.created_at || new Date().toISOString(),
      };

      try {
        await db.staff_pay_periods.upsert(payPeriod);
        result.synced++;
      } catch (err) {
        result.errors.push(`Sync failed for ${staff.name}: ${(err as Error).message}`);
      }
    }

    // 6. Recompute KPI summary
    await recomputeKpiSummary(db, month);

    // 7. Store last sync time
    localStorage.setItem(SYNC_KEY, new Date().toISOString());

  } catch (err) {
    result.errors.push((err as Error).message);
  }

  return result;
}
