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
      { name: 'SerialNo', type: 'string', required: '선택', description: '비어 있으면 SerialNo가 설정된 모든 APK 사용자에게 표시. 값이 있으면 해당 SerialNo APK만 표시. APK SerialNo가 비어 있으면 알림 수집 안 함. "Admin"은 관리자 APK(SerialNo=Admin) 전용' },
      { name: 'date', type: 'string (YYYY-MM-DD)', required: '필수', description: '알림 게시일. NRM_ALARM_DISPLAY_DAYS(기본 7일) 이내만 앱에 노출' },
    ],
  },
  userBanList: {
    rootKey: 'userBanList',
    description: '기기 단위 사용자 차단·해제 이력 (data/userBanList.json). deviceId별 최신 id 기록의 isBanned가 적용됨. 로그인 계정(Google/Kakao)과 무관',
    fields: [
      { name: 'id', type: 'number', required: '필수', description: '기록 고유 ID. 같은 deviceId는 최신 id가 적용됨' },
      { name: 'userName', type: 'string', required: '필수', description: '차단 등록 시점의 사용자 이름 스냅샷 (관리자 표시용)' },
      { name: 'SerialNo', type: 'string', required: '필수', description: '차단 등록 시점의 계정 UUID 스냅샷. 판정 키가 아님' },
      { name: 'deviceId', type: 'string', required: '필수', description: '차단 대상 기기. nrm_user_list.deviceId(ANDROID_ID SHA-256)와 동일. 앱 이용 차단 판정 키' },
      { name: 'content', type: 'string', required: '선택', description: '차단·해제 사유 메모' },
      { name: 'isBanned', type: 'boolean', required: '필수', description: 'true면 해당 deviceId 기기에서 앱 이용 차단' },
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
    description: 'OAuth 로그인 사용자 등록 이력 (data/custom-apk/userList.json). 앱이 nrm_user_list에 upsert하며 빌드 스크립트는 행을 만들지 않음',
    fields: [
      { name: 'id', type: 'number', required: '필수', description: '등록 고유 ID' },
      { name: 'appKind', type: 'string', required: '필수', description: '로그인 플랫폼 google | kakao' },
      { name: 'userName', type: 'string', required: '필수', description: 'OAuth에서 받은 원본 표시 이름' },
      { name: 'userCustomName', type: 'string | null', required: '선택', description: '앱 설정에서 사용자가 지정한 계정별 표시 이름. null이면 userName 사용' },
      { name: 'userEmail', type: 'string', required: '필수', description: 'OAuth에서 받은 이메일' },
      { name: 'oauthUserId', type: 'string', required: '필수', description: 'OAuth 공급자가 발급한 사용자 고유 ID. 이메일 미제공 계정 식별에도 사용' },
      { name: 'SerialNo', type: 'string', required: '필수', description: '로그인 시 발급하는 UUID' },
      { name: 'isAdmin', type: 'string', required: '필수', description: '관리자 여부 y/n. 기본 n' },
      { name: 'version', type: 'string', required: '필수', description: '등록 시점 앱 버전' },
      { name: 'Createddate', type: 'string (YYYY-MM-DD)', required: '필수', description: 'userList 등록일' },
      { name: 'deviceId', type: 'string | null', required: '선택', description: '최초 설치 기기의 ANDROID_ID SHA-256 해시값. 미등록(최초 설치 전) 시 null' },
      { name: 'lastAccessDate', type: 'string | null', required: '선택', description: '마지막 앱 실행 시각. 형식: YYYY-MM-DD HH:mm:ss.SSS. 미등록 시 null' },
    ],
  },
  apkVersion: {
    rootKey: '(루트 객체)',
    description: 'GitHub Releases 공개 APK 최신 버전 (data/apkVersion.json). 앱 시작 시 PAT 없이 조회',
    fields: [
      { name: 'version', type: 'string', required: '필수', description: '최신 릴리스 APK semver (package.json versionName과 동기화)' },
      { name: 'createdDate', type: 'string (YYYY-MM-DD HH:mm:ss.SSS)', required: '필수', description: '해당 버전 APK 빌드·등록 시각' },
    ],
  },
};

const JSON_FILES = [
  { sheet: 'alarm', rel: 'data/alarm.json' },
  { sheet: 'userBanList', rel: 'data/userBanList.json' },
  { sheet: 'inquiry', rel: 'data/inquiry.json' },
  { sheet: 'userList', rel: 'data/custom-apk/userList.json' },
  { sheet: 'apkVersion', rel: 'data/apkVersion.json' },
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
