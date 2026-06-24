import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { submitInquiryReplyToGithub } from '@/lib/nrmGithubInquiryReply';
import { downloadInquiryAttachmentFile } from '@/lib/nrmInquiryAttachmentDownload';
import {
  fetchAllInquiriesForAdminViaApi,
  formatInquiryCreatedYmd,
  inquiryListTitle,
  type NrmInquiryItem,
} from '@/lib/nrmInquiryClient';
import { validateInquiryReplyContent } from '@/lib/nrmJsonFieldValidation';
import { NRM_INQUIRY_MAX_REPLY_CHARS } from '@/lib/nrmRemoteDataConfig';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';
import { notifyUserError } from '@/lib/nrmDevLog';
import { notifyUser } from '@/lib/nrmUserNotify';

const PAGE_SIZE = 15;
const INPUT_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

type SectionKind = 'pending' | 'answered';

const DETAIL_FIELDS: { key: keyof NrmInquiryItem; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'userName', label: 'userName' },
  { key: 'SerialNo', label: 'SerialNo' },
  { key: 'version', label: 'version' },
  { key: 'content', label: 'content' },
  { key: 'Createddate', label: 'Createddate' },
  { key: 'attachedFile', label: 'attachedFile' },
];

const keyExtractorInquiry = (item: NrmInquiryItem) => String(item.id);

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

function formatFieldValue(item: NrmInquiryItem, key: keyof NrmInquiryItem): string {
  if (key === 'isAnswered') return item.isAnswered ? 'true' : 'false';
  const raw = item[key];
  if (raw === null || raw === undefined) return '';
  return String(raw);
}

type InquiryDetailBlockProps = {
  item: NrmInquiryItem;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  downloading: boolean;
  onDownload: (fileName: string) => void;
};

const InquiryDetailBlock = memo(function InquiryDetailBlock({
  item,
  titleColor,
  bodyColor,
  isDark,
  downloading,
  onDownload,
}: InquiryDetailBlockProps) {
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;

  return (
    <View style={styles.detailFields}>
      {DETAIL_FIELDS.map((field) => {
        const value = formatFieldValue(item, field.key);
        const isContent = field.key === 'content';
        const isAttach = field.key === 'attachedFile';
        return (
          <View key={field.key} style={styles.fieldBlock}>
            <Text style={[styles.fieldKey, { color: bodyColor }]}>{field.label}</Text>
            {isAttach && value ? (
              <View style={styles.attachRow}>
                <Text style={[styles.fieldVal, { color: titleColor, flex: 1 }]} numberOfLines={2}>
                  {value}
                </Text>
                <Pressable
                  onPress={() => onDownload(value)}
                  disabled={downloading}
                  style={({ pressed }) => [
                    styles.downloadBtn,
                    { borderColor: hairline },
                    pressed && styles.downloadBtnPressed,
                    downloading && styles.downloadBtnDisabled,
                  ]}>
                  {downloading ? (
                    <ActivityIndicator size="small" color={nrmTokens.color.primary} />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={16} color={nrmTokens.color.primary} />
                      <Text style={styles.downloadBtnLabel}>다운로드</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : (
              <Text
                style={[
                  styles.fieldVal,
                  { color: titleColor },
                  isContent && styles.fieldValMultiline,
                ]}>
                {value || '—'}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
});

type InquiryRowProps = {
  item: NrmInquiryItem;
  section: SectionKind;
  expanded: boolean;
  onToggle: (id: number) => void;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  replyDraft: string;
  onReplyDraftChange: (id: number, text: string) => void;
  onSubmitReply: (item: NrmInquiryItem) => void;
  submitting: boolean;
  downloadingAttach: boolean;
  onDownloadAttach: (fileName: string) => void;
};

const InquiryRow = memo(function InquiryRow({
  item,
  section,
  expanded,
  onToggle,
  titleColor,
  bodyColor,
  isDark,
  replyDraft,
  onReplyDraftChange,
  onSubmitReply,
  submitting,
  downloadingAttach,
  onDownloadAttach,
}: InquiryRowProps) {
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#fff';
  const expandedBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const dateYmd = formatInquiryCreatedYmd(item.Createddate);
  const pending = section === 'pending';

  const badgeBg = pending
    ? isDark
      ? 'rgba(0,102,204,0.22)'
      : 'rgba(0,102,204,0.1)'
    : isDark
      ? 'rgba(110,207,138,0.22)'
      : 'rgba(46,160,87,0.12)';
  const badgeColor = pending ? nrmTokens.color.primary : '#3d9a5c';
  const badgeLabel = pending ? '답변대기중' : '답변완료';

  const onPress = useCallback(() => onToggle(item.id), [item.id, onToggle]);
  const onChangeReply = useCallback(
    (text: string) => {
      if (text.length > NRM_INQUIRY_MAX_REPLY_CHARS) return;
      onReplyDraftChange(item.id, text);
    },
    [item.id, onReplyDraftChange],
  );
  const onPressSubmit = useCallback(() => onSubmitReply(item), [item, onSubmitReply]);

  return (
    <View style={[styles.card, { borderColor: hairline, backgroundColor: cardBg }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.rowHead, pressed && styles.rowHeadPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}>
        <View style={[styles.sectionBadge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.sectionBadgeLabel, { color: badgeColor }]}>({badgeLabel})</Text>
        </View>
        <Text style={[styles.rowTitle, { color: titleColor }]} numberOfLines={1}>
          {inquiryListTitle(item.userName)}
        </Text>
        <Text style={[styles.dateYmd, { color: bodyColor }]}>{dateYmd}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={bodyColor}
        />
      </Pressable>

      {expanded ? (
        <View style={[styles.detail, { borderTopColor: hairline, backgroundColor: expandedBg }]}>
          <InquiryDetailBlock
            item={item}
            titleColor={titleColor}
            bodyColor={bodyColor}
            isDark={isDark}
            downloading={downloadingAttach}
            onDownload={onDownloadAttach}
          />

          <View style={[styles.divider, { backgroundColor: hairline }]} />

          {pending ? (
            <View style={styles.replyArea}>
              <TextInput
                value={replyDraft}
                onChangeText={onChangeReply}
                placeholder="답변 내용을 입력하세요"
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}
                multiline
                textAlignVertical="top"
                style={[
                  styles.replyInput,
                  { color: titleColor, borderColor: hairline, backgroundColor: inputBg },
                ]}
              />
              <Text style={[styles.replyCounter, { color: bodyColor }]}>
                [{replyDraft.length}/{NRM_INQUIRY_MAX_REPLY_CHARS}]
              </Text>
              <View style={styles.replyBtnRow}>
                <Pressable
                  onPress={onPressSubmit}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.replySubmitBtn,
                    (pressed || submitting) && styles.replySubmitBtnPressed,
                    submitting && styles.replySubmitBtnDisabled,
                  ]}>
                  {submitting ? (
                    <ActivityIndicator color={nrmTokens.color.onPrimary} size="small" />
                  ) : (
                    <Text style={styles.replySubmitLabel}>답변하기</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <Text style={[styles.replyHeading, { color: bodyColor }]}>답변 :</Text>
              <Text style={[styles.replyBody, { color: titleColor }]}>
                {item.replyContent || '—'}
              </Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
});

type SectionHeaderProps = {
  title: string;
  count?: number;
  showCount?: boolean;
  open: boolean;
  onToggle: () => void;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
};

function SectionHeader({
  title,
  count,
  showCount = true,
  open,
  onToggle,
  titleColor,
  bodyColor,
  isDark,
}: SectionHeaderProps) {
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.sectionHead,
        { borderColor: hairline },
        pressed && { opacity: 0.88 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}>
      <Text style={[styles.sectionHeadTitle, { color: titleColor }]}>
        {title}
        {showCount && count !== undefined ? (
          <Text style={[styles.sectionHeadCount, { color: bodyColor }]}> ({count})</Text>
        ) : null}
      </Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={bodyColor} />
    </Pressable>
  );
}

type InquirySectionListProps = {
  items: NrmInquiryItem[];
  section: SectionKind;
  open: boolean;
  displayCount: number;
  onLoadMore: () => void;
  expandedIds: Set<number>;
  onToggleItem: (id: number) => void;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  replyDrafts: Record<number, string>;
  onReplyDraftChange: (id: number, text: string) => void;
  onSubmitReply: (item: NrmInquiryItem) => void;
  submittingId: number | null;
  downloadingAttach: boolean;
  onDownloadAttach: (fileName: string) => void;
};

function InquirySectionList({
  items,
  section,
  open,
  displayCount,
  onLoadMore,
  expandedIds,
  onToggleItem,
  titleColor,
  bodyColor,
  isDark,
  replyDrafts,
  onReplyDraftChange,
  onSubmitReply,
  submittingId,
  downloadingAttach,
  onDownloadAttach,
}: InquirySectionListProps) {
  if (!open) return null;

  const displayRows = items.slice(0, displayCount);

  return (
    <FlatList
      data={displayRows}
      keyExtractor={keyExtractorInquiry}
      scrollEnabled={false}
      initialNumToRender={PAGE_SIZE}
      maxToRenderPerBatch={PAGE_SIZE}
      windowSize={5}
      renderItem={({ item }) => (
        <InquiryRow
          item={item}
          section={section}
          expanded={expandedIds.has(item.id)}
          onToggle={onToggleItem}
          titleColor={titleColor}
          bodyColor={bodyColor}
          isDark={isDark}
          replyDraft={replyDrafts[item.id] ?? ''}
          onReplyDraftChange={onReplyDraftChange}
          onSubmitReply={onSubmitReply}
          submitting={submittingId === item.id}
          downloadingAttach={downloadingAttach}
          onDownloadAttach={onDownloadAttach}
        />
      )}
      ListEmptyComponent={
        <Text style={[styles.sectionEmpty, { color: bodyColor }]}>
          {section === 'pending' ? '답변 대기 문의가 없습니다.' : '답변 완료 문의가 없습니다.'}
        </Text>
      }
      ListFooterComponent={
        displayCount < items.length ? (
          <ActivityIndicator
            size="small"
            color={nrmTokens.color.primary}
            style={styles.sectionFooterLoader}
          />
        ) : null
      }
      onEndReached={() => {
        if (displayCount < items.length) onLoadMore();
      }}
      onEndReachedThreshold={0.35}
    />
  );
}

export function NrmAdminInquiryListPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [allItems, setAllItems] = useState<NrmInquiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [answeredOpen, setAnsweredOpen] = useState(false);
  const [pendingDisplayCount, setPendingDisplayCount] = useState(PAGE_SIZE);
  const [answeredDisplayCount, setAnsweredDisplayCount] = useState(PAGE_SIZE);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [downloadingAttach, setDownloadingAttach] = useState(false);
  const [globalBusy, setGlobalBusy] = useState(false);

  const modalScrim = getNrmModalScrimColor(isDark);

  const { pendingItems, answeredItems } = useMemo(() => {
    const pending: NrmInquiryItem[] = [];
    const answered: NrmInquiryItem[] = [];
    for (const item of allItems) {
      if (item.isAnswered) answered.push(item);
      else pending.push(item);
    }
    return { pendingItems: pending, answeredItems: answered };
  }, [allItems]);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setPendingDisplayCount(PAGE_SIZE);
      setAnsweredDisplayCount(PAGE_SIZE);
      setExpandedIds(new Set());
      setReplyDrafts({});
    }
    try {
      setAllItems(await fetchAllInquiriesForAdminViaApi());
    } catch {
      if (!silent) {
        setAllItems([]);
      }
      void notifyUser('문의 목록을 불러오지 못했습니다.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onToggleItem = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onReplyDraftChange = useCallback((id: number, text: string) => {
    setReplyDrafts((prev) => ({ ...prev, [id]: text }));
  }, []);

  const onDownloadAttach = useCallback(async (fileName: string) => {
    setDownloadingAttach(true);
    try {
      await downloadInquiryAttachmentFile(fileName);
    } catch (e) {
      notifyUserError('inquiry.attachDownload', e, '첨부 파일 다운로드에 실패했습니다.');
    } finally {
      setDownloadingAttach(false);
    }
  }, []);

  const onSubmitReply = useCallback(
    async (item: NrmInquiryItem) => {
      const draft = replyDrafts[item.id] ?? '';
      const err = validateInquiryReplyContent(draft);
      if (err) {
        void notifyUser(err);
        return;
      }
      setSubmittingId(item.id);
      setGlobalBusy(true);
      const replyText = draft.trim();
      try {
        await submitInquiryReplyToGithub(item.id, replyText);
        setAllItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? { ...row, isAnswered: true, replyContent: replyText }
              : row,
          ),
        );
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setReplyDrafts((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        void notifyUser('답변이 등록되었습니다.');
        void reload({ silent: true });
      } catch (e) {
        notifyUserError('inquiry.replySubmit', e, '답변 등록에 실패했습니다.');
      } finally {
        setSubmittingId(null);
        setGlobalBusy(false);
      }
    },
    [replyDrafts, reload],
  );

  return (
    <NrmMenuDrawerScroll>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.title, { color: titleColor }]}>문의 답변하기</Text>

      {loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : (
        <>
          <SectionHeader
            title="답변대기중"
            count={pendingItems.length}
            open={pendingOpen}
            onToggle={() => setPendingOpen((v) => !v)}
            titleColor={titleColor}
            bodyColor={bodyColor}
            isDark={isDark}
          />
          <InquirySectionList
            items={pendingItems}
            section="pending"
            open={pendingOpen}
            displayCount={pendingDisplayCount}
            onLoadMore={() => setPendingDisplayCount((c) => c + PAGE_SIZE)}
            expandedIds={expandedIds}
            onToggleItem={onToggleItem}
            titleColor={titleColor}
            bodyColor={bodyColor}
            isDark={isDark}
            replyDrafts={replyDrafts}
            onReplyDraftChange={onReplyDraftChange}
            onSubmitReply={onSubmitReply}
            submittingId={submittingId}
            downloadingAttach={downloadingAttach}
            onDownloadAttach={onDownloadAttach}
          />

          <SectionHeader
            title="답변완료"
            open={answeredOpen}
            onToggle={() => setAnsweredOpen((v) => !v)}
            titleColor={titleColor}
            bodyColor={bodyColor}
            isDark={isDark}
            showCount={false}
          />
          <InquirySectionList
            items={answeredItems}
            section="answered"
            open={answeredOpen}
            displayCount={answeredDisplayCount}
            onLoadMore={() => setAnsweredDisplayCount((c) => c + PAGE_SIZE)}
            expandedIds={expandedIds}
            onToggleItem={onToggleItem}
            titleColor={titleColor}
            bodyColor={bodyColor}
            isDark={isDark}
            replyDrafts={replyDrafts}
            onReplyDraftChange={onReplyDraftChange}
            onSubmitReply={onSubmitReply}
            submittingId={submittingId}
            downloadingAttach={downloadingAttach}
            onDownloadAttach={onDownloadAttach}
          />
        </>
      )}

      {globalBusy ? (
        <Modal visible transparent animationType="fade">
          <View style={[styles.blocker, { backgroundColor: modalScrim }]}>
            <ActivityIndicator size="large" color={nrmTokens.color.primary} />
          </View>
        </Modal>
      ) : null}
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
    marginVertical: nrmTokens.space.xl,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.xs,
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeadTitle: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '700',
  },
  sectionHeadCount: {
    fontWeight: '500',
  },
  sectionEmpty: {
    fontSize: nrmTokens.font.body,
    paddingVertical: nrmTokens.space.md,
    lineHeight: 22,
  },
  sectionFooterLoader: {
    marginVertical: nrmTokens.space.sm,
  },
  card: {
    borderWidth: 1,
    borderRadius: nrmTokens.radius.md,
    marginBottom: nrmTokens.space.sm,
    overflow: 'hidden',
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm + 2,
    minHeight: 48,
  },
  rowHeadPressed: {
    opacity: 0.88,
  },
  sectionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: nrmTokens.radius.pill,
    flexShrink: 0,
  },
  sectionBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  rowTitle: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  dateYmd: {
    fontSize: nrmTokens.font.caption,
    flexShrink: 0,
  },
  detail: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: nrmTokens.space.md,
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.md,
  },
  detailFields: {
    gap: nrmTokens.space.sm,
  },
  fieldBlock: {
    gap: 2,
  },
  fieldKey: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'none',
  },
  fieldVal: {
    fontSize: nrmTokens.font.body,
    lineHeight: 20,
  },
  fieldValMultiline: {
    lineHeight: 22,
  },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: 6,
    borderRadius: nrmTokens.radius.md,
    borderWidth: INPUT_BORDER,
    flexShrink: 0,
  },
  downloadBtnPressed: {
    opacity: 0.88,
  },
  downloadBtnDisabled: {
    opacity: 0.65,
  },
  downloadBtnLabel: {
    color: nrmTokens.color.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: nrmTokens.space.md,
  },
  replyArea: {
    gap: nrmTokens.space.xs,
  },
  replyInput: {
    borderWidth: INPUT_BORDER,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    minHeight: 120,
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  replyCounter: {
    fontSize: nrmTokens.font.caption,
    textAlign: 'right',
  },
  replyBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  replySubmitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: nrmTokens.space.lg,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
  },
  replySubmitBtnPressed: {
    opacity: 0.92,
  },
  replySubmitBtnDisabled: {
    opacity: 0.7,
  },
  replySubmitLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  replyHeading: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '700',
    marginBottom: nrmTokens.space.xs,
  },
  replyBody: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  blocker: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
