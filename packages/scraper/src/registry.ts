import type { SourcePluginId } from "@jfa/shared";
import { ashbyPlugin, greenhousePlugin, leverPlugin } from "./plugins/ats";
import { genericPlugin } from "./plugins/generic";
import { hnPlugin } from "./plugins/hn";
import { rssPlugin } from "./plugins/rss";
import type { SourcePlugin } from "./types";

export const PLUGINS: Record<SourcePluginId, SourcePlugin> = {
  greenhouse: greenhousePlugin,
  lever: leverPlugin,
  ashby: ashbyPlugin,
  rss: rssPlugin,
  hn_whoishiring: hnPlugin,
  generic: genericPlugin,
};
