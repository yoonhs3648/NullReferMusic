const JSON_FORBIDDEN = /["\[\]{}\\]/;

export function hasJsonForbiddenChars(value: string): boolean {
  return JSON_FORBIDDEN.test(value);
}

export function isNonEmptyTrimmed(value: string): boolean {
  return value.trim().length > 0;
}

export type NrmJsonFieldKind = 'title' | 'content';

const FIELD_LABEL: Record<NrmJsonFieldKind, string> = {
  title: '제목',
  content: '내용',
};

export function validateBanContent(value: string): string | null {
  if (hasJsonForbiddenChars(value)) {
    return '내용에 들어갈 수 없는 문자열이 있습니다.';
  }
  return null;
}

export function validateAlarmJsonField(
  kind: NrmJsonFieldKind,
  value: string,
): string | null {
  if (!isNonEmptyTrimmed(value)) {
    return `${FIELD_LABEL[kind]}을(를) 입력하세요.`;
  }
  if (hasJsonForbiddenChars(value)) {
    return `${FIELD_LABEL[kind]}에 포함할 수 없는 문자열이 있습니다.`;
  }
  return null;
}

export function validateInquiryContent(value: string): string | null {
  if (!isNonEmptyTrimmed(value)) {
    return '문의내용을 입력하세요.';
  }
  if (value.length > 500) {
    return '문의내용은 500자까지 입력할 수 있습니다.';
  }
  if (hasJsonForbiddenChars(value)) {
    return '문의내용에 포함할 수 없는 문자가 있습니다.';
  }
  return null;
}
