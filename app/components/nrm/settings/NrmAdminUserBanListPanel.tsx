import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { unbanUserOnGithub } from '@/lib/nrmGithubUserBanRegister';
import {
  fetchUserBanList,
  listCurrentlyBannedUsers,
  type NrmUserBanItem,
} from '@/lib/nrmUserBanClient';
import { notifyUser } from '@/lib/nrmUserNotify';

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

export function NrmAdminUserBanListPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [rows, setRows] = useState<NrmUserBanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchUserBanList();
      setRows(listCurrentlyBannedUsers(all));
    } catch {
      setRows([]);
      void notifyUser('블랙리스트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onUnban = useCallback(
    async (entry: NrmUserBanItem) => {
      setBusyId(entry.id);
      try {
        await unbanUserOnGithub(entry);
        void notifyUser('차단이 해제되었습니다.');
        await reload();
      } catch (e) {
        void notifyUser(e instanceof Error ? e.message : '차단 해제에 실패했습니다.');
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>사용자 블랙리스트</Text>

      {loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : rows.length === 0 ? (
        <Text style={[styles.empty, { color: bodyColor }]}>등록된 차단 사용자가 없습니다.</Text>
      ) : (
        rows.map((row) => (
          <View
            key={row.id}
            style={[styles.row, { borderColor: hairline }]}>
            <View style={styles.userCol}>
              <Text style={[styles.userName, { color: titleColor }]}>{row.userName}</Text>
              <Text style={[styles.serial, { color: bodyColor }]}>({row.SerialNo})</Text>
            </View>
            <Text style={[styles.date, { color: bodyColor }]}>{row.date}</Text>
            <Pressable
              onPress={() => void onUnban(row)}
              disabled={busyId === row.id}
              style={({ pressed }) => [
                styles.unbanBtn,
                (pressed || busyId === row.id) && styles.unbanBtnPressed,
              ]}
              accessibilityRole="button">
              {busyId === row.id ? (
                <ActivityIndicator color={nrmTokens.color.primary} size="small" />
              ) : (
                <Text style={styles.unbanLabel}>해제</Text>
              )}
            </Pressable>
          </View>
        ))
      )}
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
  loader: {
    marginVertical: nrmTokens.space.lg,
  },
  empty: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userCol: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  serial: {
    fontSize: nrmTokens.font.caption,
    marginTop: 2,
  },
  date: {
    fontSize: nrmTokens.font.caption,
    minWidth: 88,
    textAlign: 'center',
  },
  unbanBtn: {
    minWidth: 52,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  unbanBtnPressed: {
    opacity: 0.85,
  },
  unbanLabel: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
