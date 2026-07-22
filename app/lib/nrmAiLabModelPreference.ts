// AI Lab에서 사용자가 선택한 LLM 모델(LLMModel.ModelID)을 기기에 저장한다.
// 서버 계정 개념이 없어(SerialNo만 사용) 세션 간 값을 유지하려면 로컬 저장이 필요하다
// — 이게 없으면 모델을 바꾸고 AI Lab을 나갔다 돌아올 때마다 기본값(pickDefaultLlmModelId)
// 으로 되돌아가 버린다.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrm_ai_lab_selected_llm_model_id_v1';

export async function loadAiLabSelectedModelId(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function saveAiLabSelectedModelId(modelId: number): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(modelId));
  } catch {
    // 저장 실패는 무시 — 이번 실행에서만 반영 안 될 뿐 기능에는 영향 없음.
  }
}
