import { Alert, Platform } from 'react-native';

const CELLULAR_CONFIRM_MESSAGE =
  'Wi-fi 에 연결되어있지않습니다. 데이터로 다운로드 받으시겠습니까?';

/**
 * Whisper 모델·오프라인 번역기 등 대용량 다운로드 시작 전 확인.
 * Wi‑Fi가 아니면 팝업을 띄우고, 사용자가 확인할 때만 true.
 */
export async function confirmLargeDownloadIfNotOnWifi(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return true;
  }
  const { isConnectedViaWifiNative } = await import('@/lib/nrmNetwork.native');
  if (await isConnectedViaWifiNative()) {
    return true;
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      '',
      CELLULAR_CONFIRM_MESSAGE,
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: '확인', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
