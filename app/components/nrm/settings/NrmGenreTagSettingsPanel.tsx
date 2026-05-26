import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  createNewGenreCategoryId,
  loadNrmGenreTagCatalog,
  normalizeGenreTagInput,
  resetNrmGenreTagCatalogToDefault,
  saveNrmGenreTagCatalog,
  validateGenreTagCatalog,
  type NrmGenreCategory,
} from '@/lib/nrmGenreTagSettings';
import { confirmUser, notifyUser } from '@/lib/nrmUserNotify';

const PANEL_INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;
const FIELD_BORDER = 'rgba(128,128,128,0.4)';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onBack: () => void;
};

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.backRow}
      accessibilityRole="button"
      accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

export function NrmGenreTagSettingsPanel({
  titleColor,
  bodyColor,
  rowHover,
  onBack,
}: Props) {
  const [categories, setCategories] = useState<NrmGenreCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const inputBg = 'rgba(128,128,128,0.08)';
  const cardBorder = FIELD_BORDER;
  const chipBg = 'rgba(0, 102, 204, 0.12)';
  const chipBorder = 'rgba(0, 102, 204, 0.35)';

  useEffect(() => {
    let cancelled = false;
    void loadNrmGenreTagCatalog().then((catalog) => {
      if (cancelled) return;
      setCategories(catalog.categories);
      setExpandedIds(new Set());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const updateCategory = useCallback(
    (id: string, patch: Partial<NrmGenreCategory>) => {
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
    },
    [],
  );

  const addCategory = useCallback(() => {
    const id = createNewGenreCategoryId();
    setCategories((prev) => [...prev, { id, name: '', tags: [] }]);
    setExpandedIds((prev) => new Set(prev).add(id));
  }, []);

  const removeCategory = useCallback(async (cat: NrmGenreCategory) => {
    const ok = await confirmUser(
      `「${cat.name.trim() || '이름 없음'}」 장르를 삭제할까요?`,
    );
    if (!ok) return;
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    setTagDrafts((prev) => {
      const next = { ...prev };
      delete next[cat.id];
      return next;
    });
  }, []);

  const addTag = useCallback((categoryId: string) => {
    const raw = tagDrafts[categoryId] ?? '';
    const tag = normalizeGenreTagInput(raw);
    if (!tag) return;
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== categoryId) return c;
        if (c.tags.some((t) => normalizeGenreTagInput(t) === tag)) return c;
        return { ...c, tags: [...c.tags, tag] };
      }),
    );
    setTagDrafts((prev) => ({ ...prev, [categoryId]: '' }));
  }, [tagDrafts]);

  const removeTag = useCallback((categoryId: string, tag: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? { ...c, tags: c.tags.filter((t) => t !== tag) }
          : c,
      ),
    );
  }, []);

  const handleSave = useCallback(async () => {
    const err = validateGenreTagCatalog(categories);
    if (err) {
      notifyUser(err);
      return;
    }
    setSaving(true);
    try {
      await saveNrmGenreTagCatalog({ version: 1, categories });
      notifyUser('장르·태그 설정을 저장했습니다.');
    } catch (e) {
      notifyUser(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }, [categories]);

  const handleResetDefaults = useCallback(async () => {
    const ok = await confirmUser(
      '기본값으로 되돌릴까요? 저장된 사용자 설정은 사라집니다.',
    );
    if (!ok) return;
    setSaving(true);
    try {
      const catalog = await resetNrmGenreTagCatalogToDefault();
      setCategories(catalog.categories);
      setExpandedIds(new Set());
      setTagDrafts({});
      notifyUser('기본 장르·태그로 복원했습니다.');
    } finally {
      setSaving(false);
    }
  }, []);

  const validationHint = validateGenreTagCatalog(categories);

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={nrmTokens.color.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <NrmMenuDrawerScroll contentContainerStyle={styles.scrollContent}>
        <MenuBackRow onPress={onBack} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>장르 태그 설정</Text>
        <Text style={[styles.lead, { color: bodyColor }]}>
          Last.fm 장르별 차트는 아래 태그를 기준으로 조회합니다. 장르 종류마다 하나 이상의
          태그가 있어야 저장할 수 있습니다.
        </Text>

        {categories.map((cat) => {
          const expanded = expandedIds.has(cat.id);
          const tagCount = cat.tags.length;
          const tagInvalid = cat.name.trim().length > 0 && tagCount === 0;
          return (
            <View
              key={cat.id}
              style={[styles.card, { borderColor: cardBorder, backgroundColor: inputBg }]}>
              <Pressable
                onPress={() => toggleExpanded(cat.id)}
                style={({ pressed }) => [
                  styles.cardHeader,
                  pressed && { backgroundColor: rowHover },
                ]}>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { color: titleColor }]} numberOfLines={1}>
                    {cat.name.trim() || '새 장르'}
                  </Text>
                  <Text style={[styles.cardMeta, { color: bodyColor }]}>
                    태그 {tagCount}개
                    {tagInvalid ? ' · 태그 필요' : ''}
                  </Text>
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={bodyColor}
                />
              </Pressable>

              {expanded ? (
                <View style={styles.cardBody}>
                  <Text style={[styles.fieldLabel, { color: bodyColor }]}>장르 이름</Text>
                  <TextInput
                    value={cat.name}
                    onChangeText={(name) => updateCategory(cat.id, { name })}
                    placeholder="예: K-POP"
                    placeholderTextColor="rgba(128,128,128,0.65)"
                    style={[
                      styles.nameInput,
                      {
                        color: titleColor,
                        borderColor: cardBorder,
                        borderWidth: PANEL_INPUT_BORDER,
                      },
                    ]}
                  />

                  <Text style={[styles.fieldLabel, { color: bodyColor }]}>태그</Text>
                  <View style={styles.chipWrap}>
                    {cat.tags.length === 0 ? (
                      <Text style={[styles.emptyTags, { color: bodyColor }]}>
                        태그를 추가해 주세요
                      </Text>
                    ) : (
                      cat.tags.map((tag) => (
                        <View
                          key={`${cat.id}-${tag}`}
                          style={[styles.chip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                          <Text style={[styles.chipHash, { color: nrmTokens.color.primary }]}>
                            #
                          </Text>
                          <Text style={[styles.chipText, { color: titleColor }]}>{tag}</Text>
                          <Pressable
                            onPress={() => removeTag(cat.id, tag)}
                            hitSlop={8}
                            accessibilityLabel={`${tag} 태그 삭제`}>
                            <Ionicons
                              name="close-circle"
                              size={18}
                              color={bodyColor}
                            />
                          </Pressable>
                        </View>
                      ))
                    )}
                  </View>

                  <View style={styles.addTagRow}>
                    <TextInput
                      value={tagDrafts[cat.id] ?? ''}
                      onChangeText={(v) =>
                        setTagDrafts((prev) => ({ ...prev, [cat.id]: v }))
                      }
                      onSubmitEditing={() => addTag(cat.id)}
                      placeholder="새 태그 입력"
                      placeholderTextColor="rgba(128,128,128,0.65)"
                      returnKeyType="done"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[
                        styles.tagInput,
                        {
                          color: titleColor,
                          borderColor: cardBorder,
                          borderWidth: PANEL_INPUT_BORDER,
                        },
                      ]}
                    />
                    <Pressable
                      onPress={() => addTag(cat.id)}
                      style={({ pressed }) => [
                        styles.addTagBtn,
                        pressed && styles.addTagBtnPressed,
                      ]}>
                      <Text style={styles.addTagBtnLabel}>추가</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={() => void removeCategory(cat)}
                    style={({ pressed }) => [
                      styles.deleteGenreBtn,
                      pressed && { opacity: 0.85 },
                    ]}>
                    <Ionicons name="trash-outline" size={18} color="#c62828" />
                    <Text style={styles.deleteGenreLabel}>이 장르 삭제</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}

        <Pressable
          onPress={addCategory}
          style={({ pressed }) => [
            styles.addGenreBtn,
            { borderColor: nrmTokens.color.primary },
            pressed && { backgroundColor: rowHover },
          ]}>
          <Ionicons name="add" size={22} color={nrmTokens.color.primary} />
          <Text style={[styles.addGenreLabel, { color: nrmTokens.color.primary }]}>
            장르 추가
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void handleResetDefaults()}
          disabled={saving}
          style={({ pressed }) => [
            styles.secondaryBtn,
            saving && styles.secondaryBtnDisabled,
            pressed && { backgroundColor: rowHover },
          ]}>
          <Text style={[styles.secondaryBtnLabel, { color: nrmTokens.color.primary }]}>
            초기값 복원
          </Text>
        </Pressable>

        {validationHint ? (
          <Text style={styles.validationHint}>{validationHint}</Text>
        ) : null}

        <View style={styles.footerSpacer} />
      </NrmMenuDrawerScroll>

      <View style={[styles.footer, { borderTopColor: cardBorder }]}>
        <Pressable
          onPress={() => void handleSave()}
          disabled={saving || !!validationHint}
          style={({ pressed }) => [
            styles.saveBtn,
            (saving || validationHint) && styles.saveBtnDisabled,
            pressed && !saving && !validationHint && styles.saveBtnPressed,
          ]}>
          {saving ? (
            <ActivityIndicator color={nrmTokens.color.onPrimary} />
          ) : (
            <Text style={styles.saveBtnLabel}>저장</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  scrollContent: { paddingBottom: nrmTokens.space.md },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: nrmTokens.space.xxl,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xxs,
    marginBottom: nrmTokens.space.md,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: nrmTokens.font.body,
    color: nrmTokens.color.primary,
    fontWeight: '500',
  },
  panelTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    marginBottom: nrmTokens.space.sm,
    letterSpacing: -0.4,
  },
  lead: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    marginBottom: nrmTokens.space.lg,
  },
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: PANEL_INPUT_BORDER,
    marginBottom: nrmTokens.space.sm,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.md,
    gap: nrmTokens.space.sm,
  },
  cardHeaderText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  cardMeta: { fontSize: nrmTokens.font.caption, marginTop: 2 },
  cardBody: {
    paddingHorizontal: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.md,
    gap: nrmTokens.space.sm,
  },
  fieldLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    marginTop: nrmTokens.space.xs,
  },
  nameInput: {
    borderRadius: nrmTokens.radius.sm,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: nrmTokens.font.body,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.xs,
    minHeight: 28,
  },
  emptyTags: { fontSize: nrmTokens.font.caption, fontStyle: 'italic' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: nrmTokens.space.sm,
    paddingRight: nrmTokens.space.xs,
    paddingVertical: 6,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  chipHash: { fontSize: nrmTokens.font.caption, fontWeight: '700' },
  chipText: { fontSize: nrmTokens.font.caption, flexShrink: 1 },
  addTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
  },
  tagInput: {
    flex: 1,
    borderRadius: nrmTokens.radius.sm,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: nrmTokens.font.caption,
  },
  addTagBtn: {
    backgroundColor: nrmTokens.color.primary,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: 10,
    borderRadius: nrmTokens.radius.sm,
  },
  addTagBtnPressed: { opacity: 0.9 },
  addTagBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  deleteGenreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    alignSelf: 'flex-start',
    marginTop: nrmTokens.space.xs,
    paddingVertical: nrmTokens.space.xs,
  },
  deleteGenreLabel: { color: '#c62828', fontSize: nrmTokens.font.caption },
  addGenreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nrmTokens.space.xs,
    paddingVertical: nrmTokens.space.md,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: nrmTokens.space.sm,
  },
  addGenreLabel: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.md,
    alignItems: 'center',
    paddingVertical: nrmTokens.space.md,
    marginTop: nrmTokens.space.sm,
  },
  secondaryBtnDisabled: { opacity: 0.5 },
  secondaryBtnLabel: { fontSize: nrmTokens.font.caption, fontWeight: '600' },
  validationHint: {
    color: '#c62828',
    fontSize: nrmTokens.font.caption,
    textAlign: 'center',
    marginTop: nrmTokens.space.sm,
  },
  footerSpacer: { height: nrmTokens.space.lg },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.xs,
  },
  saveBtn: {
    backgroundColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.md,
    paddingVertical: nrmTokens.space.md,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnPressed: { opacity: 0.92 },
  saveBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
