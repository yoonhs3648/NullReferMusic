import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';

import {
  NrmAdminUserSearchBar,
  type NrmAdminUserSearchField,
} from '@/components/nrm/settings/NrmAdminUserSearchBar';
import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmUserListEntry } from '@/lib/nrmUserListClient';

export type { NrmAdminUserSearchField };

const PAGE_SIZE = 20;

const keyExtractorUserEntry = (item: NrmUserListEntry) => `${item.id}-${item.SerialNo}`;

function deviceRegistered(entry: NrmUserListEntry): boolean {
  return entry.deviceId !== null && entry.deviceId !== '';
}

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  rows: NrmUserListEntry[];
  loading: boolean;
  scrollEnabled?: boolean;
  rowPressable?: boolean;
  onRowPress?: (entry: NrmUserListEntry) => void;
};

export function NrmAdminUserLookupContent({
  titleColor,
  bodyColor,
  isDark,
  rows,
  loading,
  scrollEnabled = false,
  rowPressable = true,
  onRowPress,
}: Props) {
  const [searchActive, setSearchActive] = useState(false);
  const [searchField, setSearchField] = useState<NrmAdminUserSearchField>('userName');
  const [searchText, setSearchText] = useState('');
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const chipRegistered = isDark ? 'rgba(30,180,100,0.2)' : 'rgba(20,160,80,0.12)';
  const chipNotReg = isDark ? 'rgba(180,180,180,0.12)' : 'rgba(0,0,0,0.06)';

  const filteredRows = useMemo(() => {
    if (!searchActive || !searchText.trim()) return rows;
    const q = searchText.trim().toLowerCase();
    return rows.filter((r) => {
      const val = searchField === 'userName' ? r.userName : r.SerialNo;
      return val.toLowerCase().includes(q);
    });
  }, [rows, searchActive, searchField, searchText]);

  const displayRows = filteredRows.slice(0, displayCount);

  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [searchText, searchField, searchActive]);

  const renderRow: ListRenderItem<NrmUserListEntry> = ({ item }) => {
    const rowBody = (
      <>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: titleColor }]}>{item.userName}</Text>
          <Text style={[styles.rowSerial, { color: bodyColor }]}>{item.SerialNo}</Text>
        </View>
        <View
          style={[
            styles.deviceChip,
            { backgroundColor: deviceRegistered(item) ? chipRegistered : chipNotReg },
          ]}>
          <Text
            style={[
              styles.deviceChipText,
              {
                color: deviceRegistered(item)
                  ? isDark
                    ? '#4cd97b'
                    : '#178040'
                  : bodyColor,
              },
            ]}>
            {deviceRegistered(item) ? '등록됨' : '미등록'}
          </Text>
        </View>
        {rowPressable ? <Ionicons name="chevron-forward" size={16} color={bodyColor} /> : null}
      </>
    );

    if (!rowPressable) {
      return <View style={[styles.row, { borderColor: hairline }]}>{rowBody}</View>;
    }

    return (
      <Pressable
        onPress={() => onRowPress?.(item)}
        style={({ pressed }) => [
          styles.row,
          { borderColor: hairline },
          pressed && {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
          },
        ]}>
        {rowBody}
      </Pressable>
    );
  };

  return (
    <View style={scrollEnabled ? styles.flexFill : undefined}>
      <NrmAdminUserSearchBar
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
        searchActive={searchActive}
        onSearchActiveChange={setSearchActive}
        searchField={searchField}
        onSearchFieldChange={setSearchField}
        searchText={searchText}
        onSearchTextChange={setSearchText}
      />

      {loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={displayRows}
          keyExtractor={keyExtractorUserEntry}
          scrollEnabled={scrollEnabled}
          style={scrollEnabled ? styles.flexFill : undefined}
          contentContainerStyle={scrollEnabled ? styles.listContent : undefined}
          initialNumToRender={PAGE_SIZE}
          maxToRenderPerBatch={PAGE_SIZE}
          windowSize={5}
          renderItem={renderRow}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: bodyColor }]}>
              {rows.length === 0 ? '등록된 사용자가 없습니다.' : '검색 결과가 없습니다.'}
            </Text>
          }
          ListFooterComponent={
            !loading && displayCount < filteredRows.length ? (
              <ActivityIndicator
                size="small"
                color={nrmTokens.color.primary}
                style={styles.footerLoader}
              />
            ) : null
          }
          onEndReached={() => {
            if (displayCount < filteredRows.length) {
              setDisplayCount((c) => c + PAGE_SIZE);
            }
          }}
          onEndReachedThreshold={0.4}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flexFill: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
  },
  loader: {
    marginVertical: nrmTokens.space.xl,
  },
  empty: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
    marginTop: nrmTokens.space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  rowSerial: {
    fontSize: nrmTokens.font.caption,
  },
  deviceChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: nrmTokens.radius.pill,
  },
  deviceChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: nrmTokens.space.md,
  },
});
