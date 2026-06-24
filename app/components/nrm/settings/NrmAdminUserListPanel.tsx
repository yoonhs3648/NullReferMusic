import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmAdminUserLookupContent } from '@/components/nrm/settings/NrmAdminUserLookupContent';
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { fetchDedupedUserListEntries, type NrmUserListEntry } from '@/lib/nrmUserListClient';
import { notifyUser } from '@/lib/nrmUserNotify';

type DetailField =
  | { key: Exclude<keyof NrmUserListEntry, 'deviceId'>; label: string; special?: undefined }
  | { key: 'deviceId'; label: string; special: 'device' };

const DETAIL_FIELDS: DetailField[] = [
  { key: 'id', label: 'ID' },
  { key: 'appName', label: '앱 이름' },
  { key: 'userName', label: '사용자 이름' },
  { key: 'SerialNo', label: '시리얼번호' },
  { key: 'version', label: '버전' },
  { key: 'Createddate', label: '등록일' },
  { key: 'lastAccessDate', label: '마지막 접속' },
  { key: 'deviceId', label: '기기 등록', special: 'device' },
];

function resolveDetailValue(entry: NrmUserListEntry, field: DetailField): string {
  if (field.special === 'device') {
    const v = entry.deviceId;
    return v !== null && v !== '' ? '등록됨' : '등록안됨';
  }
  const raw = entry[field.key as keyof NrmUserListEntry];
  return String(raw ?? '-');
}

function deviceRegistered(entry: NrmUserListEntry): boolean {
  return entry.deviceId !== null && entry.deviceId !== '';
}

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

export function NrmAdminUserListPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [allRows, setAllRows] = useState<NrmUserListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailEntry, setDetailEntry] = useState<NrmUserListEntry | null>(null);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const surfaceBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;

  const reload = useCallback(async () => {
    setLoading(true);
    setAllRows([]);
    try {
      setAllRows(await fetchDedupedUserListEntries());
    } catch {
      void notifyUser('사용자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>사용자 조회</Text>

      <NrmAdminUserLookupContent
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
        rows={allRows}
        loading={loading}
        onRowPress={setDetailEntry}
      />

      <Modal
        visible={detailEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailEntry(null)}>
        <View style={styles.modalFullscreen}>
          <Pressable onPress={() => setDetailEntry(null)} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.detailCard, { backgroundColor: surfaceBg, borderColor: hairline }]}>
            <View style={[styles.detailHeader, { borderColor: hairline }]}>
              <Text style={[styles.detailTitle, { color: titleColor }]}>사용자 상세 정보</Text>
              {detailEntry !== null && (
                <View
                  style={[
                    styles.detailDeviceBadge,
                    {
                      backgroundColor: deviceRegistered(detailEntry)
                        ? isDark
                          ? 'rgba(30,180,100,0.25)'
                          : 'rgba(20,160,80,0.12)'
                        : isDark
                          ? 'rgba(180,180,180,0.15)'
                          : 'rgba(0,0,0,0.07)',
                    },
                  ]}>
                  <Ionicons
                    name={deviceRegistered(detailEntry) ? 'phone-portrait' : 'phone-portrait-outline'}
                    size={12}
                    color={
                      deviceRegistered(detailEntry)
                        ? isDark
                          ? '#4cd97b'
                          : '#178040'
                        : bodyColor
                    }
                  />
                  <Text
                    style={[
                      styles.detailDeviceBadgeText,
                      {
                        color: deviceRegistered(detailEntry)
                          ? isDark
                            ? '#4cd97b'
                            : '#178040'
                          : bodyColor,
                      },
                    ]}>
                    기기 {deviceRegistered(detailEntry) ? '등록됨' : '등록안됨'}
                  </Text>
                </View>
              )}
            </View>

            {detailEntry !== null &&
              DETAIL_FIELDS.map((field) => (
                <View key={field.key} style={[styles.detailRow, { borderColor: hairline }]}>
                  <Text style={[styles.detailLabel, { color: bodyColor }]}>{field.label}</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      { color: titleColor },
                      field.special === 'device' && {
                        color: deviceRegistered(detailEntry)
                          ? isDark
                            ? '#4cd97b'
                            : '#178040'
                          : bodyColor,
                        fontWeight: '500',
                      },
                    ]}
                    selectable={field.special !== 'device'}>
                    {resolveDetailValue(detailEntry, field)}
                  </Text>
                </View>
              ))}

            <Pressable
              onPress={() => setDetailEntry(null)}
              style={({ pressed }) => [styles.detailCloseBtn, pressed && { opacity: 0.75 }]}>
              <Text style={styles.detailCloseBtnText}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </NrmMenuDrawerScroll>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.sm,
  },
  backText: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: nrmTokens.space.md,
  },
  modalFullscreen: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  detailCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.lg,
    paddingTop: nrmTokens.space.lg,
    paddingBottom: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: nrmTokens.space.sm,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  detailDeviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: nrmTokens.radius.pill,
  },
  detailDeviceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: nrmTokens.space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: nrmTokens.space.sm,
  },
  detailLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
    width: 80,
    flexShrink: 0,
    paddingTop: 1,
  },
  detailValue: {
    fontSize: nrmTokens.font.body,
    flex: 1,
    flexWrap: 'wrap',
  },
  detailCloseBtn: {
    margin: nrmTokens.space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  detailCloseBtnText: {
    color: '#ffffff',
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
