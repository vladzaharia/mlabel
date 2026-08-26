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
        "A fully local, zero-network desktop app for manual data labeling, driven entirely by one .jsonc config file.",
      logo: { src: "./src/assets/icon.svg", alt: "MLabel" },
      lastUpdated: true,
      editLink: { baseUrl: `${REPO}/edit/main/docs/` },
      social: [{ icon: "github", label: "GitHub", href: REPO }],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Get started",
          items: [
            { label: "What MLabel is", slug: "start/overview" },
            { label: "Download", slug: "start/download" },
            { label: "Install on macOS", slug: "start/install-macos" },
            { label: "Install on Windows", slug: "start/install-windows" },
            { label: "Set up your config", slug: "start/setup" },
            { label: "Your first labeling run", slug: "start/first-run" },
            { label: "Updating", slug: "start/updating" },
            { label: "Concepts", slug: "start/concepts" },
          ],
        },
        {
          label: "Using MLabel",
          items: [{ autogenerate: { directory: "guide" } }],
        },
        {
          label: "Config schema",
          items: [
            { label: "Anatomy of a config", slug: "config" },
            { label: "Value types", slug: "config/types" },
            { label: "Fields", slug: "config/fields" },
            { label: "Fill — where values come from", slug: "config/fill" },
            { label: "Widgets", slug: "config/widgets" },
            { label: "Display and captions", slug: "config/display" },
            { label: "Cards and layout", slug: "config/cards" },
            { label: "Display rules", slug: "config/rules" },
            { label: "Keyboard shortcuts", slug: "config/shortcuts" },
            { label: "Adapters", slug: "config/adapters" },
            { label: "Network policy", slug: "config/network" },
            { label: "Versioning", slug: "config/versioning" },
            { label: "Every error explained", slug: "config/errors" },
            { label: "Cookbook", slug: "config/cookbook" },
            { label: "Authoring as an agent", slug: "config/agents" },
          ],
        },
        {
          label: "Schema reference",
          collapsed: true,
          items: [{ autogenerate: { directory: "reference" } }],
        },
        {
          label: "Running a project",
          items: [{ autogenerate: { directory: "admin" } }],
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
