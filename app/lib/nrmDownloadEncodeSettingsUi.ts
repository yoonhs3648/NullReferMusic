import type { EncodeOptionItem } from '@/components/nrm/settings/NrmDownloadEncodeOptionPicker';
import {
  NRM_DOWNLOAD_LOSSLESS_MODES,
  NRM_DOWNLOAD_VBR_MODES,
  type NrmDownloadLosslessMode,
  type NrmDownloadVbrMode,
} from '@/lib/nrmDownloadSettings';

export const VBR_SETTING_OPTIONS: readonly EncodeOptionItem[] =
  NRM_DOWNLOAD_VBR_MODES.map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description,
    hint: 'hint' in m ? m.hint : undefined,
    icon: vbrIconForMode(m.id),
  }));

export const LOSSLESS_SETTING_OPTIONS: readonly EncodeOptionItem[] =
  NRM_DOWNLOAD_LOSSLESS_MODES.map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description,
    hint: 'hint' in m ? m.hint : undefined,
    icon: losslessIconForMode(m.id),
  }));

function vbrIconForMode(id: NrmDownloadVbrMode): EncodeOptionItem['icon'] {
  switch (id) {
    case 'vbr_best':
      return 'sparkles-outline';
    case 'vbr_balanced':
      return 'options-outline';
    case 'vbr_compact':
      return 'archive-outline';
    default:
      return 'speedometer-outline';
  }
}

function losslessIconForMode(id: NrmDownloadLosslessMode): EncodeOptionItem['icon'] {
  switch (id) {
    case 'smart':
      return 'shield-checkmark-outline';
    case 'lossless_path':
      return 'git-branch-outline';
    default:
      return 'refresh-outline';
  }
}
