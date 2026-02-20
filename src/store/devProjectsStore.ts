import { create } from 'zustand';
import { fetchProjectStatus, TRACKED_PROJECTS, type ProjectStatus } from '../services/github-projects';

interface DevProjectsState {
  projects: Record<string, ProjectStatus>;
  isLoading: boolean;
  lastFetched: Date | null;
  error: string | null;

  fetchAll: () => Promise<void>;
  fetchProject: (repoName: string) => Promise<void>;
  startAutoRefresh: (intervalMs?: number) => () => void;
}

export const useDevProjectsStore = create<DevProjectsState>((set, get) => ({
  projects: {},
  isLoading: false,
  lastFetched: null,
  error: null,

  /**
   * Fetch status for all tracked projects in parallel.
   */
  fetchAll: async () => {
    set({ isLoading: true, error: null });

    try {
      const results = await Promise.allSettled(
        TRACKED_PROJECTS.map(project => fetchProjectStatus(project))
      );

      const projects: Record<string, ProjectStatus> = {};

      results.forEach((result, index) => {
        const project = TRACKED_PROJECTS[index];

        if (result.status === 'fulfilled') {
          projects[project.repo] = result.value;
        } else {
          // Handle rejected promise
          console.warn(`[DevProjectsStore] Failed to fetch ${project.repo}:`, result.reason);
          projects[project.repo] = {
            repo: project.repo,
            displayName: project.displayName,
            description: project.description,
            branches: { names: [], count: 0, isHealthy: false },
            openPRs: [],
            milestones: [],
            progress: { completed: 0, total: 0, percent: 0 },
            stageProgress: [],
            shipGate: null,
            northStar: null,
            outOfScope: [],
            session: null,
            latestCommit: null,
            fetchedAt: new Date(),
            error: result.reason instanceof Error ? result.reason.message : 'Failed to fetch project',
          };
        }
      });

      set({
        projects,
        lastFetched: new Date(),
        isLoading: false,
      });
    } catch (err) {
      console.error('[DevProjectsStore] Failed to fetch projects:', err);
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch projects',
        isLoading: false,
      });
    }
  },

  /**
   * Fetch status for a single project by repo name.
   */
  fetchProject: async (repoName: string) => {
    const project = TRACKED_PROJECTS.find(p => p.repo === repoName);

    if (!project) {
      console.warn(`[DevProjectsStore] Unknown repo: ${repoName}`);
      return;
    }

    try {
      const status = await fetchProjectStatus(project);
      const currentProjects = get().projects;

      set({
        projects: {
          ...currentProjects,
          [repoName]: status,
        },
        lastFetched: new Date(),
      });
    } catch (err) {
      console.error(`[DevProjectsStore] Failed to fetch ${repoName}:`, err);
    }
  },

  /**
   * Start auto-refreshing project data at a given interval.
   * Returns a cleanup function to stop the refresh.
   */
  startAutoRefresh: (intervalMs = 60000) => {
    // Fetch immediately
    get().fetchAll().catch(err => {
      console.error('[DevProjectsStore] Initial fetch failed:', err);
    });

    // Set up interval
    const intervalId = setInterval(() => {
      get().fetchAll().catch(err => {
        console.error('[DevProjectsStore] Auto-refresh failed:', err);
      });
    }, intervalMs);

    // Return cleanup function
    return () => {
      clearInterval(intervalId);
    };
  },
}));
