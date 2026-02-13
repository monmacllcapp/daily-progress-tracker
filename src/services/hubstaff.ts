import type { TitanDatabase } from '../db';
import type { StaffMember } from '../types/schema';

const HUBSTAFF_BASE = 'https://api.hubstaff.com';
const TOKEN_ENDPOINT = 'https://account.hubstaff.com/access_tokens';

// Cached access token with expiry
let cachedToken: { access_token: string; expires_at: number } | null = null;

function getToken(): string | null {
  return import.meta.env.VITE_HUBSTAFF_PAT || null;
}

function getOrgId(): string {
  const orgId = import.meta.env.VITE_HUBSTAFF_ORG_ID;
  if (!orgId) throw new Error('VITE_HUBSTAFF_ORG_ID not configured');
  return orgId;
}

export function isHubstaffConnected(): boolean {
  try {
    return !!getToken() && !!getOrgId();
  } catch {
    return false;
  }
}

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expires_at > Date.now() + 60000) {
    return cachedToken.access_token;
  }

  const pat = getToken();
  if (!pat) throw new Error('Hubstaff PAT not configured');

  // Exchange refresh token (PAT) for access token
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(pat)}`,
  });

  if (!res.ok) {
    throw new Error(`Hubstaff token exchange failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  // Cache the access token (ignore refresh_token in response, keep original PAT)
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.access_token;
}

async function hubstaffFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  let token = await getAccessToken();

  const url = new URL(`${HUBSTAFF_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  let res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  // On 401, clear cache and retry once (token may have expired early)
  if (res.status === 401) {
    cachedToken = null;
    token = await getAccessToken();
    res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  if (res.status === 401) throw new Error('Hubstaff authentication failed — check your PAT');
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After') || '60';
    throw new Error(`Hubstaff rate limited — retry after ${retryAfter}s`);
  }
  if (!res.ok) throw new Error(`Hubstaff API error: ${res.status} ${res.statusText}`);

  return res.json();
}

// Raw API response types (Hubstaff v2)
interface HubstaffOrgMember {
  user_id: number;
  pay_rate?: string;
  membership_status?: string;
}

interface HubstaffUserDetail {
  id: number;
  name: string;
  email: string;
}

export interface HubstaffMember {
  id: number;
  user_id: number;
  name: string;
  email: string;
}

export interface HubstaffDailyActivity {
  user_id: number;
  date: string;
  tracked: number;    // seconds
  overall: number;    // activity seconds (NOT a percentage)
  keyboard: number;
  mouse: number;
}

export async function fetchOrgMembers(): Promise<HubstaffMember[]> {
  // Step 1: Get raw org members (has user_id but NOT name/email)
  const data = await hubstaffFetch<{ members: HubstaffOrgMember[] }>(
    `/v2/organizations/${getOrgId()}/members`
  );
  const rawMembers = data.members || [];

  // Step 2: Enrich each member with name/email from /v2/users/{id}
  const enriched: HubstaffMember[] = [];
  for (const raw of rawMembers) {
    let name = `User ${raw.user_id}`;
    let email = '';
    try {
      const userDetail = await hubstaffFetch<{ user: HubstaffUserDetail }>(
        `/v2/users/${raw.user_id}`
      );
      name = userDetail.user.name;
      email = userDetail.user.email;
    } catch {
      // Fallback to placeholder if user detail fetch fails
    }
    enriched.push({
      id: raw.user_id,
      user_id: raw.user_id,
      name,
      email,
    });
  }

  return enriched;
}

export async function fetchDailyActivities(
  startDate: string,
  endDate: string,
  userIds?: number[]
): Promise<HubstaffDailyActivity[]> {
  const allActivities: HubstaffDailyActivity[] = [];
  let pageStartId: string | undefined;

  // Cursor pagination loop
  do {
    const params: Record<string, string> = {
      'date[start]': startDate,
      'date[stop]': endDate,
    };
    if (userIds?.length) {
      params['user_ids'] = userIds.join(',');
    }
    if (pageStartId) {
      params['page_start_id'] = pageStartId;
    }

    const data = await hubstaffFetch<{
      daily_activities: HubstaffDailyActivity[];
      pagination?: { next_page_start_id?: string };
    }>(`/v2/organizations/${getOrgId()}/activities/daily`, params);

    allActivities.push(...(data.daily_activities || []));
    pageStartId = data.pagination?.next_page_start_id;
  } while (pageStartId);

  return allActivities;
}

export async function mapHubstaffToStaff(
  db: TitanDatabase
): Promise<Map<number, StaffMember>> {
  const members = await fetchOrgMembers();
  const staffDocs = await db.staff_members.find().exec();
  const staffList = staffDocs.map(d => d.toJSON() as StaffMember);

  const mapping = new Map<number, StaffMember>();

  for (const member of members) {
    // Match by hubstaff_user_id first, then by name
    const match = staffList.find(
      s => s.hubstaff_user_id === String(member.user_id)
    ) || staffList.find(
      s => s.name.toLowerCase() === member.name.toLowerCase()
    );

    if (match) {
      mapping.set(member.user_id, match);
    }
  }

  return mapping;
}
