export type YoutubeSearchItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
};

export type YoutubeSearchPageSuccess = {
  ok: true;
  items: YoutubeSearchItem[];
  nextCursor: string | null;
};

export type YoutubeSearchOutcome =
  | YoutubeSearchPageSuccess
  | { ok: false; userMessage: string; dev: Record<string, unknown> };

/** @deprecated searchYoutubePage 사용 */
export type YoutubeSearchLegacyOutcome =
  | { ok: true; items: YoutubeSearchItem[] }
  | { ok: false; userMessage: string; dev: Record<string, unknown> };
