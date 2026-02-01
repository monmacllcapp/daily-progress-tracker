const ONBOARDING_KEY = 'titan_onboarding_completed';

export function hasCompletedOnboarding(): boolean {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

export function markOnboardingComplete(): void {
    localStorage.setItem(ONBOARDING_KEY, 'true');
}
