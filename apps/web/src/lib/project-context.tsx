import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type InstanceSettings, type Project } from "@/lib/api";

const STORAGE_KEY = "aikanban-active-project-slug";

type ProjectContextValue = {
  projects: Project[];
  defaultProjectSlug: string | null;
  activeProjectSlug: string;
  activeProject: Project | null;
  loading: boolean;
  error: string | null;
  setActiveProjectSlug: (slug: string) => void;
  refreshProjects: () => Promise<void>;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

function pickInitialSlug(
  projects: Project[],
  defaultProjectSlug: string | null,
): string {
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
  if (stored && projects.some((project) => project.slug === stored)) {
    return stored;
  }
  if (defaultProjectSlug && projects.some((project) => project.slug === defaultProjectSlug)) {
    return defaultProjectSlug;
  }
  return projects[0]?.slug ?? "";
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [defaultProjectSlug, setDefaultProjectSlug] = useState<string | null>(null);
  const [activeProjectSlug, setActiveProjectSlugState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    setError(null);
    try {
      const [{ projects: nextProjects }, settingsResult] = await Promise.all([
        api.listProjects(),
        api.getInstanceSettings().catch(() => null),
      ]);
      const settings: InstanceSettings | null = settingsResult?.settings ?? null;
      const nextDefault = settings?.defaultProjectSlug ?? null;
      setProjects(nextProjects);
      setDefaultProjectSlug(nextDefault);
      setActiveProjectSlugState((current) => {
        if (current && nextProjects.some((project) => project.slug === current)) {
          return current;
        }
        return pickInitialSlug(nextProjects, nextDefault);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    }
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await refreshProjects();
      setLoading(false);
    }
    void load();
  }, [refreshProjects]);

  const setActiveProjectSlug = useCallback((slug: string) => {
    setActiveProjectSlugState(slug);
    if (slug) {
      window.localStorage.setItem(STORAGE_KEY, slug);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.slug === activeProjectSlug) ?? null,
    [projects, activeProjectSlug],
  );

  const value = useMemo(
    () => ({
      projects,
      defaultProjectSlug,
      activeProjectSlug,
      activeProject,
      loading,
      error,
      setActiveProjectSlug,
      refreshProjects,
    }),
    [
      projects,
      defaultProjectSlug,
      activeProjectSlug,
      activeProject,
      loading,
      error,
      setActiveProjectSlug,
      refreshProjects,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext() {
  const value = useContext(ProjectContext);
  if (!value) {
    throw new Error("useProjectContext must be used within ProjectProvider");
  }
  return value;
}
