import { Platform } from 'react-native';

export const NRM_DOWNLOAD_DIR_NAME = 'NullReferenceMusic';

/** 서버 MP3: 웹은 저장 대화상자, iOS는 Documents/`nullreference`, Android는 미디어 라이브러리 앨범 `nullreference`(및 공용 Downloads 동일 폴더). fileName 은 `가수 - 제목.mp3` */
export async function persistAudioAfterServerJob(
  apiBase: string,
  jobId: string,
  options: { fileName: string },
): Promise<{ savedLabel: string }> {
  if (Platform.OS === 'web') {
    const { persistAudioAfterServerJob: impl } = await import(
      './nrmPersistDownload.web'
    );
    return impl(apiBase, jobId, options);
  }
  const { persistAudioAfterServerJob: impl } = await import(
    './nrmPersistDownload.native'
  );
  return impl(apiBase, jobId, options);
}
