import type { NrmWhisperModelId } from '@/lib/nrmWhisperCatalog';
import { NRM_WHISPER_MODEL_CATALOG } from '@/lib/nrmWhisperCatalog';

export type NrmWhisperModelOption = {
  id: NrmWhisperModelId;
  label: string;
  speedLabel: string;
  qualityLabel: string;
  sizeLabel: string;
};

export const NRM_WHISPER_MODEL_OPTIONS: readonly NrmWhisperModelOption[] =
  NRM_WHISPER_MODEL_CATALOG.map((e) => ({
    id: e.id,
    label: e.label,
    speedLabel: e.speedLabel,
    qualityLabel: e.qualityLabel,
    sizeLabel: e.sizeLabel,
  }));
