// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { llmsTxt } from "./integrations/llms-txt.mjs";
import { copySchema } from "./integrations/copy-schema.mjs";

const REPO = "https://github.com/vladzaharia/mlabel";

// Served from a custom domain, so the site lives at the root — no `base`.
// Switching back to github.io project pages would mean adding `base: "/mlabel"`
// and re-checking every absolute link in the content.
export default defineConfig({
  site: "https://mlabel.vlad.gg",
  integrations: [
    copySchema(),
    llmsTxt(),
    starlight({
      title: "MLabel",
      description:
        "Guides for labeling records, preparing datasets, and administering MLabel projects.",
      logo: { src: "./src/assets/icon.svg", alt: "MLabel" },
      lastUpdated: true,
      editLink: { baseUrl: `${REPO}/edit/main/docs/` },
      social: [{ icon: "github", label: "GitHub", href: REPO }],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "What MLabel does", slug: "start/overview" },
            { label: "Download", slug: "start/download" },
            { label: "Install on macOS", slug: "start/install-macos" },
            { label: "Install on Windows", slug: "start/install-windows" },
            { label: "Update MLabel", slug: "start/updating" },
            { label: "Glossary", slug: "start/concepts" },
          ],
        },
        {
          label: "For labelers",
          collapsed: true,
          items: [
            { label: "Start an assignment", slug: "labelers" },
            { label: "Open your configuration", slug: "start/setup" },
            { label: "Your first labeling run", slug: "start/first-run" },
            { label: "Read a record", slug: "guide/reading-a-record" },
            { label: "Label and check answers", slug: "guide/labeling" },
            { label: "Save and resume", slug: "guide/sessions" },
            { label: "Export and return files", slug: "guide/exporting" },
            { label: "Keyboard shortcuts", slug: "guide/keyboard" },
            { label: "Settings", slug: "guide/settings" },
            { label: "Troubleshooting", slug: "guide/troubleshooting" },
          ],
        },
        {
          label: "For preparers",
          collapsed: true,
          items: [
            { label: "Prepare and collect data", slug: "preparers" },
            { label: "Split and join files", slug: "guide/prepare" },
            { label: "Check returned work", slug: "preparers/checking-results" },
            { label: "Manage batches", slug: "admin/distributing" },
          ],
        },
        {
          label: "For administrators",
          items: [
            { label: "Set up a project", slug: "admin" },
            { label: "Create your first project", slug: "admin/first-project" },
            { label: "Choose fields — visual guide", slug: "config/widgets" },
            { label: "Illustrated cookbook", slug: "config/cookbook" },
            { label: "Arrange the screen", slug: "config/cards" },
            { label: "Write captions and help", slug: "config/display" },
            { label: "Highlight source information", slug: "config/rules" },
            { label: "Plan the labeling task", slug: "admin/planning" },
            { label: "Distribute the app and config", slug: "admin/deploying" },
          ],
        },
        {
          label: "Configuration guides",
          collapsed: true,
          items: [
            { label: "Configuration structure", slug: "config" },
            { label: "Value types", slug: "config/types" },
            { label: "How source cells are read", slug: "config/data-values" },
            { label: "Rule conditions and list items", slug: "config/conditions" },
            { label: "Fields", slug: "config/fields" },
            { label: "Fill — where values come from", slug: "config/fill" },
            { label: "Keyboard shortcuts", slug: "config/shortcuts" },
            { label: "CSV and file-format settings", slug: "config/adapters" },
            { label: "Network policy", slug: "config/network" },
            { label: "Version compatibility", slug: "config/versioning" },
            { label: "Fix configuration errors", slug: "config/errors" },
            {
              label: "Recipe walkthroughs",
              collapsed: true,
              items: [{ autogenerate: { directory: "config/recipes" } }],
            },
            { label: "Authoring checklist", slug: "config/agents" },
          ],
        },
        {
          label: "Schema reference",
          collapsed: true,
          items: [{ autogenerate: { directory: "reference" } }],
        },
        {
          label: "Developing MLabel",
          collapsed: true,
          items: [{ autogenerate: { directory: "dev" } }],
        },
      ],
    }),
  ],
});
