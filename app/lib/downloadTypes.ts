export type HealthResponse = {
  ok?: boolean;
  ytDlp?: boolean;
  ffmpeg?: boolean;
  outputDir?: string;
  error?: string;
};

export type DownloadResponse = {
  ok?: boolean;
  jobId?: string;
  outputDir?: string;
  message?: string;
  detail?: string;
  error?: string;
  code?: number;
};
