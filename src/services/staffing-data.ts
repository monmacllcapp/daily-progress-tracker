import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import type { TitanDatabase } from '../db';
import type { StaffMember, StaffPayPeriod, StaffExpense, StaffRole, PayType, ExpenseCategory } from '../types/schema';

// Column name → field mapping for caller sheets
const CALLER_COLUMN_MAP: Record<string, keyof StaffPayPeriod> = {
  'hours worked': 'hours_worked',
  'hours': 'hours_worked',
  'activity': 'activity_pct',
  'activity %': 'activity_pct',
  'activity%': 'activity_pct',
  'leads': 'num_leads',
  '# leads': 'num_leads',
  'num leads': 'num_leads',
  'num of leads': 'num_leads',
  'passes': 'num_passes',
  '# passes': 'num_passes',
  'num passes': 'num_passes',
  'num of passes': 'num_passes',
  'cost per lead': 'cost_per_lead',
  'cost/lead': 'cost_per_lead',
  'cpl': 'cost_per_lead',
  'lists added': 'lists_added',
  'recs added': 'num_recs_added',
  '# recs added': 'num_recs_added',
  'num recs added': 'num_recs_added',
  'bonus': 'bonus',
  'holiday pay': 'holiday_pay',
  'base pay': 'base_pay',
  'total pay': 'total_pay',
  'total': 'total_pay',
  'paid': 'is_paid',
  'notes': 'notes',
};

// Column name → field mapping for closer/LM sheets
const CLOSER_COLUMN_MAP: Record<string, keyof StaffPayPeriod> = {
  'dials': 'dials',
  'convos': 'convos',
  'conversations': 'convos',
  'quality convos': 'quality_convos',
  'quality conversations': 'quality_convos',
  'lead to acq': 'lead_to_acq',
  'calls processed': 'calls_processed',
  'underwrote': 'underwrote',
  'apt set': 'apt_set',
  'appointments set': 'apt_set',
  'apt met': 'apt_met',
  'appointments met': 'apt_met',
  'offers made': 'offers_made',
  'offers': 'offers_made',
  'offers accepted': 'offers_accepted',
  'accepted': 'offers_accepted',
  'offers rejected': 'offers_rejected',
  'rejected': 'offers_rejected',
  'deals closed': 'deals_closed',
  'deals': 'deals_closed',
  'deals fell through': 'deals_fellthrough',
  'fell through': 'deals_fellthrough',
  'commission': 'commission',
  'base pay': 'base_pay',
  'total pay': 'total_pay',
  'total': 'total_pay',
  'paid': 'is_paid',
  'notes': 'notes',
};

// Expense column mapping
const EXPENSE_COLUMN_MAP: Record<string, keyof StaffExpense> = {
  'date': 'date',
  'month': 'date',
  'vendor': 'vendor',
  'platform': 'vendor',
  'platform / vendor': 'vendor',
  'amount': 'amount',
  'cost': 'amount',
  'subtotal': 'amount',
  'spend': 'amount',
  'channel': 'channel',
  'leads generated': 'leads_generated',
  'leads': 'leads_generated',
  'cost per lead': 'cost_per_lead',
  'cpl': 'cost_per_lead',
  'notes': 'notes',
  'description': 'notes',
};

// Known staff names → role detection
const STAFF_DEFAULTS: Record<string, { role: StaffRole; pay_type: PayType; base_rate: number; hubstaff_user_id?: string }> = {
  'anita':    { role: 'cold_caller',   pay_type: 'hourly',      base_rate: 3,      hubstaff_user_id: '3617393' },
  'andie':    { role: 'admin_caller',  pay_type: 'hourly',      base_rate: 3,      hubstaff_user_id: '2607224' },
  'emma':     { role: 'closer',        pay_type: 'weekly_flat', base_rate: 100 },
  'enrique':  { role: 'closer',        pay_type: 'weekly_flat', base_rate: 100 },
  'patricia': { role: 'lead_manager',  pay_type: 'weekly_flat', base_rate: 312.50 },
};

// Expense sheet name → category
const EXPENSE_SHEETS: Record<string, ExpenseCategory> = {
  'platform expenses': 'platform',
  'platform': 'platform',
  'marketing expenses': 'marketing',
  'marketing': 'marketing',
  'other opex': 'other_opex',
  'other expenses': 'other_opex',
  'opex': 'other_opex',
};

function detectRoleFromColumns(headers: string[]): { role: StaffRole; pay_type: PayType } {
  const lower = headers.map(h => h.toLowerCase().trim());
  if (lower.some(h => h.includes('hours worked') || h === 'hours')) {
    // Has "Hours Worked" → hourly caller
    if (lower.some(h => h.includes('admin'))) {
      return { role: 'admin_caller', pay_type: 'hourly' };
    }
    return { role: 'cold_caller', pay_type: 'hourly' };
  }
  if (lower.some(h => h === 'dials' || h.includes('calls processed'))) {
    return { role: 'lead_manager', pay_type: 'weekly_flat' };
  }
  if (lower.some(h => h === 'convos' || h.includes('conversations') || h.includes('deals'))) {
    return { role: 'closer', pay_type: 'weekly_flat' };
  }
  return { role: 'cold_caller', pay_type: 'hourly' }; // fallback
}

function normalizeColumnName(col: string): string {
  return col
    .toLowerCase()
    .trim()
    .replace(/\s*\(.*?\)/g, '')   // strip parenthetical: ($), ($/hr), (Y/N), (Google, FB, etc.)
    .replace(/[#_?]/g, '')        // strip #, _, ?
    .replace(/\s+/g, ' ')         // collapse whitespace
    .trim();
}

function parseWeekDate(val: unknown): string | null {
  if (!val) return null;
  // Handle Date objects (from cellDates: true)
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      return val.toISOString().split('T')[0];
    }
    return null;
  }
  if (typeof val === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
  }
  if (typeof val === 'string') {
    // Try ISO/standard date parse
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
    // Handle month abbreviations: "Dec", "Nov", "Jan 2026", etc.
    const monthMatch = val.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{4})?$/i);
    if (monthMatch) {
      const months: Record<string, string> = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
      const m = months[monthMatch[1].toLowerCase().substring(0, 3)];
      const y = monthMatch[2] || new Date().getFullYear().toString();
      return `${y}-${m}-01`;
    }
  }
  return null;
}

export interface ImportResult {
  staffImported: number;
  payPeriodsImported: number;
  expensesImported: number;
  errors: string[];
}

export async function parseStaffingWorkbook(
  file: File,
  db: TitanDatabase
): Promise<ImportResult> {
  const result: ImportResult = { staffImported: 0, payPeriodsImported: 0, expensesImported: 0, errors: [] };

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  for (const sheetName of workbook.SheetNames) {
    const lowerName = sheetName.toLowerCase().trim();
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined });

    if (rows.length === 0) continue;

    // Check if this is an expense sheet
    const expenseCategory = EXPENSE_SHEETS[lowerName];
    if (expenseCategory) {
      await importExpenseSheet(db, rows, expenseCategory, sheetName, result);
      continue;
    }

    // Check if this is a staff sheet
    const staffKey = Object.keys(STAFF_DEFAULTS).find(k => lowerName.includes(k));
    if (staffKey) {
      await importStaffSheet(db, rows, staffKey, sheetName, result);
    }
  }

  return result;
}

async function importStaffSheet(
  db: TitanDatabase,
  rows: Record<string, unknown>[],
  staffKey: string,
  sheetName: string,
  result: ImportResult
): Promise<void> {
  const defaults = STAFF_DEFAULTS[staffKey];
  const headers = Object.keys(rows[0] || {});
  const detected = detectRoleFromColumns(headers);

  // Upsert staff member — find by name (case-insensitive manual filter; $regex with RegExp objects fails in Dexie)
  const allStaffDocs = await db.staff_members.find().exec();
  const existingStaff = allStaffDocs.filter(
    doc => doc.name.toLowerCase().includes(staffKey.toLowerCase())
  );

  let staffId: string;
  if (existingStaff.length > 0) {
    staffId = existingStaff[0].id;
  } else {
    staffId = uuidv4();
    const staffName = staffKey.charAt(0).toUpperCase() + staffKey.slice(1);
    await db.staff_members.upsert({
      id: staffId,
      name: staffName,
      role: defaults?.role || detected.role,
      pay_type: defaults?.pay_type || detected.pay_type,
      base_rate: defaults?.base_rate || 0,
      hubstaff_user_id: defaults?.hubstaff_user_id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    result.staffImported++;
  }

  console.log(`[Import] Sheet "${sheetName}": staffKey="${staffKey}", staffId="${staffId}", existing=${existingStaff.length > 0}`);

  // Determine which column map to use
  const isHourly = (defaults?.pay_type || detected.pay_type) === 'hourly';
  const columnMap = isHourly
    ? { ...CALLER_COLUMN_MAP }
    : { ...CLOSER_COLUMN_MAP, ...CALLER_COLUMN_MAP };

  // Find the date/week column
  const dateCol = headers.find(h => {
    const lower = h.toLowerCase();
    return lower.includes('week') || lower.includes('date') || lower.includes('period');
  }) || headers[0];

  for (const row of rows) {
    const periodStart = parseWeekDate(row[dateCol]);
    if (!periodStart) continue;

    // Compute period end (Sunday = start + 6 days)
    const startDate = new Date(periodStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const periodEnd = endDate.toISOString().split('T')[0];

    // Dedup key: staff_id + period_start
    const dedupId = `${staffId}_${periodStart}`;

    const payPeriod: StaffPayPeriod = {
      id: dedupId,
      staff_id: staffId,
      period_start: periodStart,
      period_end: periodEnd,
      base_pay: 0,
      total_pay: 0,
      is_paid: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Debug: log column mapping for first row
    if (row === rows[0]) {
      const mappedCols: string[] = [];
      const unmappedCols: string[] = [];
      for (const colName of Object.keys(row)) {
        const normalized = normalizeColumnName(colName);
        if (columnMap[normalized]) {
          mappedCols.push(`${colName} → ${columnMap[normalized]}`);
        } else {
          unmappedCols.push(`${colName} (="${normalized}")`);
        }
      }
      console.log(`[Import] Sheet "${sheetName}" column mapping:`, { mapped: mappedCols, unmapped: unmappedCols });
    }

    // Map columns to fields
    for (const [colName, value] of Object.entries(row)) {
      if (value === undefined || value === null || value === '') continue;
      const normalized = normalizeColumnName(colName);
      const field = columnMap[normalized];
      if (!field) continue;

      if (field === 'is_paid') {
        (payPeriod as Record<string, unknown>)[field] =
          value === true || value === 'yes' || value === 'Yes' || value === 'YES' || value === 1;
      } else if (field === 'notes') {
        (payPeriod as Record<string, unknown>)[field] = String(value);
      } else {
        const num = typeof value === 'number' ? value : parseFloat(String(value));
        if (!isNaN(num)) {
          (payPeriod as Record<string, unknown>)[field] = num;
        }
      }
    }

    // Compute base_pay if not provided
    if (!payPeriod.base_pay && isHourly && payPeriod.hours_worked) {
      payPeriod.base_pay = payPeriod.hours_worked * (defaults?.base_rate || 0);
    }
    if (!payPeriod.base_pay && !isHourly) {
      payPeriod.base_pay = defaults?.base_rate || 0;
    }

    // Compute total_pay if not provided
    if (!payPeriod.total_pay) {
      payPeriod.total_pay = payPeriod.base_pay + (payPeriod.bonus || 0) + (payPeriod.holiday_pay || 0) + (payPeriod.commission || 0);
    }

    try {
      await db.staff_pay_periods.upsert(payPeriod);
      result.payPeriodsImported++;
    } catch (err) {
      result.errors.push(`Row in ${sheetName}: ${(err as Error).message}`);
    }
  }
}

async function importExpenseSheet(
  db: TitanDatabase,
  rows: Record<string, unknown>[],
  category: ExpenseCategory,
  sheetName: string,
  result: ImportResult
): Promise<void> {
  const headers = Object.keys(rows[0] || {});

  for (const row of rows) {
    // Find date
    const dateCol = headers.find(h => {
      const lower = h.toLowerCase();
      return lower.includes('date') || lower.includes('month');
    }) || headers[0];
    const dateVal = parseWeekDate(row[dateCol]);
    // For subscription-style expenses without row dates, use current month
    const fallbackMonth = new Date().toISOString().substring(0, 7);
    const effectiveDate = dateVal || `${fallbackMonth}-01`;

    const month = effectiveDate.substring(0, 7); // YYYY-MM

    const expense: StaffExpense = {
      id: uuidv4(),
      date: effectiveDate,
      category,
      vendor: '',
      amount: 0,
      month,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    for (const [colName, value] of Object.entries(row)) {
      if (value === undefined || value === null || value === '') continue;
      const normalized = normalizeColumnName(colName);
      const field = EXPENSE_COLUMN_MAP[normalized];
      if (!field) continue;

      if (field === 'vendor' || field === 'channel' || field === 'notes') {
        (expense as Record<string, unknown>)[field] = String(value);
      } else if (field === 'date') {
        // Already handled
      } else {
        const num = typeof value === 'number' ? value : parseFloat(String(value));
        if (!isNaN(num)) {
          (expense as Record<string, unknown>)[field] = num;
        }
      }
    }

    if (expense.amount > 0 || expense.vendor) {
      try {
        await db.staff_expenses.upsert(expense);
        result.expensesImported++;
      } catch (err) {
        result.errors.push(`Expense row in ${sheetName}: ${(err as Error).message}`);
      }
    }
  }
}

export async function recomputeKpiSummary(
  db: TitanDatabase,
  month: string // YYYY-MM
): Promise<void> {
  // Get all pay periods that overlap this month
  const allPayPeriods = await db.staff_pay_periods.find().exec();
  const monthPayPeriods = allPayPeriods
    .map(d => d.toJSON() as StaffPayPeriod)
    .filter(pp => pp.period_start.startsWith(month));

  // Get expenses for this month
  const allExpenses = await db.staff_expenses.find({
    selector: { month }
  }).exec();
  const expenses = allExpenses.map(d => d.toJSON() as StaffExpense);

  // Compute totals
  const totalStaffCost = monthPayPeriods.reduce((sum, pp) => sum + pp.total_pay, 0);
  const platformCost = expenses.filter(e => e.category === 'platform').reduce((sum, e) => sum + e.amount, 0);
  const marketingSpend = expenses.filter(e => e.category === 'marketing').reduce((sum, e) => sum + e.amount, 0);
  const otherOpex = expenses.filter(e => e.category === 'other_opex').reduce((sum, e) => sum + e.amount, 0);
  const totalBurn = totalStaffCost + platformCost + marketingSpend + otherOpex;

  // Total leads from callers
  const totalLeads = monthPayPeriods.reduce((sum, pp) => sum + (pp.num_leads || 0), 0);
  const avgCpl = totalLeads > 0 ? totalBurn / totalLeads : 0;

  // Per-staff breakdown
  const staffDocs = await db.staff_members.find().exec();
  const staffList = staffDocs.map(d => d.toJSON() as StaffMember);
  const breakdown = staffList.map(s => {
    const periods = monthPayPeriods.filter(pp => pp.staff_id === s.id);
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      total_pay: periods.reduce((sum, pp) => sum + pp.total_pay, 0),
      hours: periods.reduce((sum, pp) => sum + (pp.hours_worked || 0), 0),
      leads: periods.reduce((sum, pp) => sum + (pp.num_leads || 0), 0),
      deals: periods.reduce((sum, pp) => sum + (pp.deals_closed || 0), 0),
    };
  });

  await db.staff_kpi_summaries.upsert({
    id: month,
    month,
    total_staff_cost: totalStaffCost,
    total_platform_cost: platformCost,
    total_marketing_spend: marketingSpend,
    total_burn: totalBurn,
    total_leads: totalLeads,
    avg_cost_per_lead: Math.round(avgCpl * 100) / 100,
    staff_breakdown: JSON.stringify(breakdown),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function getStaffSummaries(
  db: TitanDatabase,
  month: string
): Promise<{
  staff: StaffMember[];
  payPeriods: StaffPayPeriod[];
  expenses: StaffExpense[];
}> {
  const staffDocs = await db.staff_members.find({ selector: { is_active: true } }).exec();
  const staff = staffDocs.map(d => d.toJSON() as StaffMember);

  const ppDocs = await db.staff_pay_periods.find().exec();
  const payPeriods = ppDocs
    .map(d => d.toJSON() as StaffPayPeriod)
    .filter(pp => pp.period_start.startsWith(month));

  const expDocs = await db.staff_expenses.find({ selector: { month } }).exec();
  const expenses = expDocs.map(d => d.toJSON() as StaffExpense);

  return { staff, payPeriods, expenses };
}
