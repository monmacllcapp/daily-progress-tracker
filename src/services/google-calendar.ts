import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

export interface CalendarEvent {
    id?: string;
    summary: string;
    description?: string;
    start: {
        dateTime: string;
        timeZone?: string;
    };
    end: {
        dateTime: string;
        timeZone?: string;
    };
    colorId?: string;
}

export class GoogleCalendarService {
    private auth: any = null;
    private calendar: any = null;

    /**
     * Initialize OAuth2 client
     * Note: This requires OAuth credentials from Google Cloud Console
     */
    async initialize(clientId: string, clientSecret: string, redirectUri: string) {
        this.auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        this.calendar = google.calendar({ version: 'v3', auth: this.auth });
    }

    /**
     * Get authorization URL for user consent
     */
    getAuthUrl(): string {
        if (!this.auth) {
            throw new Error('OAuth client not initialized');
        }

        return this.auth.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
    }

    /**
     * Exchange authorization code for access token
     */
    async getToken(code: string): Promise<void> {
        if (!this.auth) {
            throw new Error('OAuth client not initialized');
        }

        const { tokens } = await this.auth.getToken(code);
        this.auth.setCredentials(tokens);

        // Store tokens in localStorage for persistence
        localStorage.setItem('google_calendar_tokens', JSON.stringify(tokens));
    }

    /**
     * Load tokens from localStorage
     */
    loadStoredTokens(): boolean {
        const stored = localStorage.getItem('google_calendar_tokens');
        if (!stored || !this.auth) return false;

        try {
            const tokens = JSON.parse(stored);
            this.auth.setCredentials(tokens);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create a calendar event
     */
    async createEvent(event: CalendarEvent): Promise<string> {
        if (!this.calendar) {
            throw new Error('Calendar not initialized');
        }

        const response = await this.calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
        });

        return response.data.id;
    }

    /**
     * Update an existing calendar event
     */
    async updateEvent(eventId: string, event: CalendarEvent): Promise<void> {
        if (!this.calendar) {
            throw new Error('Calendar not initialized');
        }

        await this.calendar.events.update({
            calendarId: 'primary',
            eventId: eventId,
            requestBody: event,
        });
    }

    /**
     * Delete a calendar event
     */
    async deleteEvent(eventId: string): Promise<void> {
        if (!this.calendar) {
            throw new Error('Calendar not initialized');
        }

        await this.calendar.events.delete({
            calendarId: 'primary',
            eventId: eventId,
        });
    }

    /**
     * Get events in a date range
     */
    async getEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
        if (!this.calendar) {
            throw new Error('Calendar not initialized');
        }

        const response = await this.calendar.events.list({
            calendarId: 'primary',
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        return response.data.items || [];
    }

    /**
     * Convert priority to Google Calendar color ID
     */
    getPriorityColor(priority: 'low' | 'medium' | 'high'): string {
        switch (priority) {
            case 'high': return '11'; // Red
            case 'medium': return '5'; // Yellow
            case 'low': return '2'; // Green
            default: return '1'; // Blue
        }
    }

    /**
     * Calculate end time based on estimated minutes
     */
    calculateEndTime(startTime: string, estimatedMinutes: number): string {
        const start = new Date(startTime);
        const end = new Date(start.getTime() + estimatedMinutes * 60000);
        return end.toISOString();
    }
}

// Singleton instance
let calendarService: GoogleCalendarService | null = null;

export function getCalendarService(): GoogleCalendarService {
    if (!calendarService) {
        calendarService = new GoogleCalendarService();
    }
    return calendarService;
}
