// vs-4b.csv를 JavaScript 배열로 변환하는 스크립트
const fs = require('fs');

// CSV 파일 읽기
const csvContent = fs.readFileSync('vs-4b.csv', 'utf-8');
const lines = csvContent.trim().split('\n');

// 헤더 제거 (첫 번째 줄)
const dataLines = lines.slice(1);

// JavaScript 배열로 변환
const chats = dataLines
  .map((line, index) => {
    // CSV 파싱 - 첫 번째 컬럼(원문)만 추출
    // 따옴표로 감싸진 필드도 처리
    const match = line.match(/^"?([^",]+)"?,/);

    if (!match || !match[1]) return null;

    const originalText = match[1].trim();

    if (!originalText || originalText === '' || originalText === '원문') return null;

    // 사용자 이름 랜덤 생성
    const usernames = ['철수', '영희', '민수', '지훈', '수진', '태양', '하늘', '별', '바다', '산'];
    const username = usernames[index % usernames.length];

    return {
      username,
      text: originalText
    };
  })
  .filter(chat => chat !== null);

// JavaScript 파일로 저장
const output = `// vs-4b 채팅 데이터 (${chats.length}개)
const VS_4B_CHATS = ${JSON.stringify(chats, null, 2)};
`;

fs.writeFileSync('vs-4b-data.js', output, 'utf-8');

console.log(`✓ ${chats.length}개의 채팅을 vs-4b-data.js로 변환 완료`);
