export type YoutubeSearchItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
};

export type YoutubeSearchOutcome =
  | { ok: true; items: YoutubeSearchItem[] }
  | { ok: false; userMessage: string; dev: Record<string, unknown> };
