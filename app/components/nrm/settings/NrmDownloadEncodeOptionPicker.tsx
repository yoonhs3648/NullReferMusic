import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

import { NrmSettingsOptionPicker } from '@/components/nrm/settings/NrmSettingsOptionPicker';

export type EncodeOptionItem = {
  id: string;
  label: string;
  description: string;
  hint?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
};

type Props = {
  options: readonly EncodeOptionItem[];
  value: string;
  onChange: (id: string) => void;
  titleColor: string;
  bodyColor: string;
  rowHover?: string;
};

const DEFAULT_ROW_HOVER = 'rgba(128,128,128,0.12)';

export function NrmDownloadEncodeOptionPicker({
  options,
  value,
  onChange,
  titleColor,
  bodyColor,
  rowHover = DEFAULT_ROW_HOVER,
}: Props) {
  return (
    <NrmSettingsOptionPicker
      options={options.map((opt) => ({ id: opt.id, label: opt.label }))}
      value={value}
      onChange={onChange}
      titleColor={titleColor}
      bodyColor={bodyColor}
      rowHover={rowHover}
    />
  );
}
