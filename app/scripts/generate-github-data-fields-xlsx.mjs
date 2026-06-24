/**
 * GitHub data/*.json 필드 정의 → data/nrm-github-data-fields.xlsx
 *
 * SCHEMAS가 엑셀 내용의 단일 출처. 필드 구조 변경 시 SCHEMAS 수정 후:
 *   cd app && npm run generate:github-data-fields
 * 규칙: docs/NRM-GITHUB-DATA.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const outPath = path.join(repoRoot, 'data', 'nrm-github-data-fields.xlsx');

const mod = await import('xlsx');
const XLSX = mod.default ?? mod;

/** @type {Record<string, { rootKey: string; description: string; fields: Array<{ name: string; type: string; required: string; description: string }> }>} */
const SCHEMAS = {
  alarm: {
    rootKey: 'alarm',
    description: '앱 인앱 알림·상단 공지 딱지 (data/alarm.json)',
    fields: [
      { name: 'id', type: 'number', required: '필수', description: '알림 고유 ID. 관리자 등록 시 기존 최대값+1' },
      { name: 'isNoti', type: 'boolean', required: '필수', description: 'true면 메인 화면 상단 공지 딱지(notice)로 표시' },
      { name: 'title', type: 'string', required: '필수', description: '알림 제목 (알림 리스트·공지 딱지에 표시)' },
      { name: 'content', type: 'string', required: '필수', description: '알림 본문 (토글 펼침 시 표시)' },
      { name: 'SerialNo', type: 'string', required: '선택', description: '비어 있으면 전체 사용자에게 표시. 일반 값이면 해당 SerialNo 사용자만 표시. "Admin"은 관리자 전용(문의 알림 등) — versionInfoAdminBuild 또는 userList isAdmin=true 앱만 수신' },
      { name: 'date', type: 'string (YYYY-MM-DD)', required: '필수', description: '알림 게시일. NRM_ALARM_DISPLAY_DAYS(기본 7일) 이내만 앱에 노출' },
    ],
  },
  userBanList: {
    rootKey: 'userBanList',
    description: '사용자 차단·해제 이력 (data/userBanList.json). SerialNo별 최신 id 기록의 isBanned가 적용됨',
    fields: [
      { name: 'id', type: 'number', required: '필수', description: '기록 고유 ID' },
      { name: 'userName', type: 'string', required: '필수', description: '사용자 이름 (관리자 표시용)' },
      { name: 'SerialNo', type: 'string', required: '필수', description: '차단 대상 기기 시리얼(전화번호). APK NrmBrand.SERIAL_NO와 매칭' },
      { name: 'content', type: 'string', required: '선택', description: '차단·해제 사유 메모' },
      { name: 'isBanned', type: 'boolean', required: '필수', description: 'true면 해당 SerialNo 사용자 앱 이용 차단' },
      { name: 'date', type: 'string (YYYY-MM-DD)', required: '필수', description: '기록 등록일' },
    ],
  },
  inquiry: {
    rootKey: 'inquiry',
    description: '앱 문의하기 등록 목록 (data/inquiry.json)',
    fields: [
      { name: 'id', type: 'number', required: '필수', description: '문의 고유 ID' },
      { name: 'userName', type: 'string', required: '필수', description: '문의자 이름 (커스텀 APK는 NrmBrand.USER_NAME, 기본은 빈 문자열 가능)' },
      { name: 'SerialNo', type: 'string', required: '필수', description: '문의 기기 시리얼(전화번호)' },
      { name: 'version', type: 'string', required: '필수', description: '문의 시점 앱 버전 (package.json version)' },
      { name: 'content', type: 'string', required: '필수', description: '문의 본문' },
      { name: 'attachedFile', type: 'string', required: '선택', description: '첨부 파일 GitHub 저장 경로. 없으면 빈 문자열' },
      { name: 'isAnswered', type: 'boolean', required: '필수', description: '관리자 답변 완료 여부' },
      { name: 'replyContent', type: 'string', required: '선택', description: '관리자 답변 본문. 줄바꿈 포함 가능. 미답변 시 빈 문자열' },
      { name: 'Createddate', type: 'string', required: '필수', description: '등록 시각. 형식: YYYY-MM-DD HH:mm:ss.SSS' },
    ],
  },
  userList: {
    rootKey: 'userList',
    description: '커스텀 APK 빌드 등록 이력 (data/custom-apk/userList.json)',
    fields: [
      { name: 'id', type: 'number', required: '필수', description: '등록 고유 ID' },
      { name: 'appName', type: 'string', required: '필수', description: '커스텀 APK displayName (앱 설치명)' },
      { name: 'userName', type: 'string', required: '필수', description: '수신자 이름' },
      { name: 'SerialNo', type: 'string', required: '필수', description: '커스텀 APK에 내장된 시리얼' },
      { name: 'version', type: 'string', required: '필수', description: '빌드 시점 APK 버전' },
      { name: 'Createddate', type: 'string (YYYY-MM-DD)', required: '필수', description: 'userList 등록일' },
      { name: 'deviceId', type: 'string | null', required: '선택', description: '최초 설치 기기의 ANDROID_ID SHA-256 해시값. 미등록(최초 설치 전) 시 null' },
      { name: 'lastAccessDate', type: 'string | null', required: '선택', description: '마지막 앱 실행 시각. 형식: YYYY-MM-DD HH:mm:ss.SSS. 미등록 시 null' },
      { name: 'isAdmin', type: 'boolean', required: '선택', description: 'true면 해당 커스텀 APK가 관리자 권한(Admin SerialNo 알람 수신 등). 기본 admin APK는 versionInfoAdminBuild로 별도 처리' },
    ],
  },
};

const JSON_FILES = [
  { sheet: 'alarm', rel: 'data/alarm.json' },
  { sheet: 'userBanList', rel: 'data/userBanList.json' },
  { sheet: 'inquiry', rel: 'data/inquiry.json' },
  { sheet: 'userList', rel: 'data/custom-apk/userList.json' },
];

function sheetFromSchema(schemaKey) {
  const schema = SCHEMAS[schemaKey];
  const header = ['필드명', '타입', '필수 여부', '설명'];
  const rows = schema.fields.map((f) => [f.name, f.type, f.required, f.description]);
  const meta = [
    ['JSON 루트 키', schema.rootKey],
    ['용도', schema.description],
    [],
    header,
    ...rows,
  ];
  return XLSX.utils.aoa_to_sheet(meta);
}

const wb = XLSX.utils.book_new();

for (const { sheet, rel } of JSON_FILES) {
  const jsonPath = path.join(repoRoot, rel);
  if (!fs.existsSync(jsonPath)) {
    console.warn(`skip missing: ${rel}`);
    continue;
  }
  const ws = sheetFromSchema(sheet);
  XLSX.utils.book_append_sheet(wb, ws, sheet);
}

XLSX.writeFile(wb, outPath);
console.log(`Wrote ${outPath}`);
