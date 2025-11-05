// CSV를 JavaScript 배열로 변환하는 스크립트
const fs = require('fs');

// CSV 파일 읽기
const csvContent = fs.readFileSync('서비스용어채팅.csv', 'utf-8');
const lines = csvContent.trim().split('\n');

// 헤더 제거
const dataLines = lines.slice(1);

// JavaScript 배열로 변환
const chats = dataLines
  .map((line, index) => {
    // CSV 파싱 (간단한 구현 - 따옴표 안의 쉼표 처리)
    const parts = line.split(',');

    if (parts.length < 4) return null;

    // example_chat은 마지막 컬럼
    const exampleChat = parts.slice(3).join(',').trim();

    if (!exampleChat || exampleChat === '') return null;

    // 사용자 이름 랜덤 생성
    const usernames = ['철수', '영희', '민수', '지훈', '수진', '태양', '하늘', '별', '바다', '산'];
    const username = usernames[index % usernames.length];

    return {
      username,
      text: exampleChat
    };
  })
  .filter(chat => chat !== null);

// JavaScript 파일로 저장
const output = `// 서비스 용어 채팅 데이터 (${chats.length}개)
const SERVICE_CHAT = ${JSON.stringify(chats, null, 2)};
`;

fs.writeFileSync('service-chat-data.js', output, 'utf-8');

console.log(`✓ ${chats.length}개의 채팅을 service-chat-data.js로 변환 완료`);
