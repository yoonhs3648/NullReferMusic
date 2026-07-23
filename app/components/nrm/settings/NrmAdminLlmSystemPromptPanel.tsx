import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { notifyUserError } from '@/lib/nrmDevLog';
import {
  deleteLlmSystemPrompt,
  fetchLlmSystemPromptsForAdmin,
  upsertLlmSystemPrompt,
  type NrmLlmSystemPromptItem,
} from '@/lib/nrmLlmSystemPromptClient';
import { confirmUser, notifyUser } from '@/lib/nrmUserNotify';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

const INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

function MenuBackRow({ onPress, label }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel={label ?? '뒤로'}>
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>{label ?? '뒤로'}</Text>
    </Pressable>
  );
}

type EditorState = {
  promptId: number | null;
  title: string;
  content: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY_EDITOR: EditorState = {
  promptId: null,
  title: '',
  content: '',
  sortOrder: '1',
  isActive: true,
};

/**
 * AI 시스템 프롬프트 관리.
 * 드로어 안 중첩 Modal(maxHeight+flex)은 Android에서 본문이 접히는 경우가 있어,
 * 목록/편집을 같은 패널 안에서 전환한다(다른 설정 서브화면과 동일 패턴).
 */
export function NrmAdminLlmSystemPromptPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const [items, setItems] = useState<NrmLlmSystemPromptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchLlmSystemPromptsForAdmin());
    } catch (e) {
      notifyUserError('admin.llmSystemPrompt', e, '시스템 프롬프트 목록을 불러오지 못했습니다.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditor({
      ...EMPTY_EDITOR,
      sortOrder: String(items.length > 0 ? Math.max(...items.map((i) => i.sortOrder)) + 1 : 1),
    });
    setEditorOpen(true);
  }, [items]);

  const openEdit = useCallback((item: NrmLlmSystemPromptItem) => {
    setEditor({
      promptId: item.promptId,
      title: item.title,
      content: item.content,
      sortOrder: String(item.sortOrder),
      isActive: item.isActive,
    });
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
  }, []);

  const onSave = useCallback(async () => {
    const sortOrder = Number.parseInt(editor.sortOrder.trim(), 10);
    if (!Number.isFinite(sortOrder)) {
      void notifyUser('정렬 순서는 숫자로 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      await upsertLlmSystemPrompt({
        promptId: editor.promptId,
        title: editor.title,
        content: editor.content,
        sortOrder,
        isActive: editor.isActive,
      });
      setEditorOpen(false);
      void notifyUser(editor.promptId == null ? '시스템 프롬프트를 추가했습니다.' : '시스템 프롬프트를 저장했습니다.');
      await load();
    } catch (e) {
      notifyUserError('admin.llmSystemPrompt', e, '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [editor, load]);

  const onDelete = useCallback(async () => {
    if (editor.promptId == null) return;
    const ok = await confirmUser(`「${editor.title}」 시스템 프롬프트를 삭제할까요?`);
    if (!ok) return;
    try {
      await deleteLlmSystemPrompt(editor.promptId);
      setEditorOpen(false);
      void notifyUser('삭제했습니다.');
      await load();
    } catch (e) {
      notifyUserError('admin.llmSystemPrompt', e, '삭제에 실패했습니다.');
    }
  }, [editor.promptId, editor.title, load]);

  if (editorOpen) {
    return (
      <>
        <MenuBackRow onPress={closeEditor} label="목록" />
        <Text style={[styles.title, { color: titleColor }]}>
          {editor.promptId == null ? '시스템 프롬프트 추가' : '시스템 프롬프트 수정'}
        </Text>

        <Text style={[styles.fieldLabel, { color: bodyColor }]}>제목</Text>
        <TextInput
          value={editor.title}
          onChangeText={(title) => setEditor((prev) => ({ ...prev, title }))}
          placeholder="관리자용 표시 이름"
          placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
          style={[styles.input, { color: titleColor, borderColor: hairline, backgroundColor: inputBg }]}
        />

        <Text style={[styles.fieldLabel, { color: bodyColor }]}>정렬 순서</Text>
        <TextInput
          value={editor.sortOrder}
          onChangeText={(sortOrder) => setEditor((prev) => ({ ...prev, sortOrder }))}
          keyboardType="number-pad"
          placeholder="1"
          placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
          style={[styles.input, { color: titleColor, borderColor: hairline, backgroundColor: inputBg }]}
        />

        <View style={styles.activeRowEdit}>
          <Text style={[styles.fieldLabel, { color: bodyColor, marginBottom: 0 }]}>활성</Text>
          <Switch
            value={editor.isActive}
            onValueChange={(isActive) => setEditor((prev) => ({ ...prev, isActive }))}
            trackColor={{ false: '#9ca3af', true: nrmTokens.color.primary }}
          />
        </View>

        <Text style={[styles.fieldLabel, { color: bodyColor }]}>본문</Text>
        <TextInput
          value={editor.content}
          onChangeText={(content) => setEditor((prev) => ({ ...prev, content }))}
          placeholder="모델에 전달할 시스템 프롬프트"
          placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
          multiline
          textAlignVertical="top"
          style={[
            styles.input,
            styles.contentInput,
            { color: titleColor, borderColor: hairline, backgroundColor: inputBg },
          ]}
        />

        <Pressable
          onPress={() => void onSave()}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveBtn,
            saving && { opacity: 0.6 },
            pressed && !saving && { opacity: 0.88 },
          ]}
          accessibilityRole="button">
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnLabel}>저장</Text>}
        </Pressable>

        {editor.promptId != null ? (
          <Pressable
            onPress={() => void onDelete()}
            disabled={saving}
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.75 }]}
            accessibilityRole="button"
            accessibilityLabel="삭제">
            <Text style={styles.deleteLabel}>삭제</Text>
          </Pressable>
        ) : null}
      </>
    );
  }

  return (
    <>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>AI 시스템 프롬프트 설정</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={nrmTokens.color.primary} />
        </View>
      ) : items.length === 0 ? (
        <Text style={[styles.empty, { color: bodyColor }]}>등록된 시스템 프롬프트가 없습니다.</Text>
      ) : (
        items.map((item) => (
          <Pressable
            key={item.promptId}
            onPress={() => openEdit(item)}
            style={({ pressed }) => [
              styles.card,
              { borderColor: hairline, backgroundColor: inputBg },
              pressed && { backgroundColor: rowHover },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${item.title} 보기`}>
            <Text style={[styles.cardTitle, { color: titleColor }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={bodyColor} />
          </Pressable>
        ))
      )}

      {/* 드로어 하단 「닫기」 바로 위 — Shell content flexGrow + marginTop:auto */}
      <Pressable
        onPress={openCreate}
        style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
        accessibilityLabel="시스템 프롬프트 추가">
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addBtnLabel}>추가</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: nrmTokens.space.sm,
    alignSelf: 'flex-start',
  },
  backText: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: nrmTokens.space.md,
  },
  addBtn: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'stretch',
    minHeight: 44,
    paddingHorizontal: nrmTokens.space.md,
    borderRadius: nrmTokens.radius.md,
    backgroundColor: nrmTokens.color.primary,
    marginBottom: nrmTokens.space.sm,
  },
  addBtnLabel: {
    color: '#fff',
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  center: {
    paddingVertical: nrmTokens.space.xl,
    alignItems: 'center',
  },
  empty: {
    fontSize: nrmTokens.font.body,
    paddingVertical: nrmTokens.space.lg,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    marginBottom: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.md,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: nrmTokens.font.caption,
    marginBottom: 6,
    marginTop: nrmTokens.space.sm,
  },
  input: {
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: nrmTokens.font.body,
  },
  contentInput: {
    minHeight: 220,
  },
  activeRowEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: nrmTokens.space.sm,
  },
  saveBtn: {
    marginTop: nrmTokens.space.lg,
    minHeight: 44,
    borderRadius: nrmTokens.radius.md,
    backgroundColor: nrmTokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnLabel: {
    color: '#fff',
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  deleteBtn: {
    marginTop: nrmTokens.space.sm,
    alignItems: 'center',
    paddingVertical: 10,
  },
  deleteLabel: {
    color: nrmTokens.color.danger,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
