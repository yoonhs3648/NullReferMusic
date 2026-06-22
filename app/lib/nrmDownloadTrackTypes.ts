export type PersistedAudioLocation =
  | {
      kind: 'saf';
      audioUri: string;
      dirUri: string;
      fileName: string;
    }
  | {
      kind: 'file';
      audioUri: string;
      folderUri: string;
      fileName: string;
    }
  | {
      kind: 'web';
      trackId: string;
      audioUri: string;
      fileName: string;
    };

export type NrmDownloadTrackItem = {
  fileName: string;
  audioUri: string;
  extension: string;
  location: PersistedAudioLocation;
  lrcUri?: string;
  displayLabel: string;
};
