import { Select } from "@/components/ui/input";
import { useProjectContext } from "@/lib/project-context";

export function ProjectSwitcher({ className }: { className?: string }) {
  const { projects, activeProjectSlug, setActiveProjectSlug, loading } = useProjectContext();

  if (loading && projects.length === 0) {
    return (
      <span className={`text-[length:var(--text-xs)] text-[var(--color-text-subtle)] ${className ?? ""}`}>
        Projects…
      </span>
    );
  }

  if (projects.length === 0) {
    return (
      <span className={`text-[length:var(--text-xs)] text-[var(--color-text-subtle)] ${className ?? ""}`}>
        No projects
      </span>
    );
  }

  return (
    <label className={`flex items-center gap-2 ${className ?? ""}`}>
      <span className="text-[length:var(--text-xs)] font-medium text-[var(--color-text-subtle)]">Project</span>
      <Select
        value={activeProjectSlug}
        onChange={(event) => setActiveProjectSlug(event.target.value)}
        aria-label="Active project"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.slug}>
            {project.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
