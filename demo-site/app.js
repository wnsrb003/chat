// 전역 상태 (SAMPLE_CHATS는 chat-data.js에서 로드됨)
const state = {
  ws: null,
  chats: SAMPLE_CHATS,
  displayedChats: [],
  selectedLang: "en", // 단일 언어 선택으로 변경
  translatedCount: 0,
  totalTime: 0,
  connected: false,
  isSimulating: false,
  isTranslating: false,
  currentSimIndex: 0,
  currentTransIndex: 0,
  translationQueue: [],
  chatSpeed: 500,
  simulateInterval: null,
};

// DOM 요소
const elements = {
  originalChat: document.getElementById("originalChat"),
  status: document.getElementById("status"),
  totalChats: document.getElementById("totalChats"),
  translatedCount: document.getElementById("translatedCount"),
  avgTime: document.getElementById("avgTime"),
  simulateBtn: document.getElementById("simulateBtn"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  clearBtn: document.getElementById("clearBtn"),
  speedSlider: document.getElementById("speedSlider"),
  speedValue: document.getElementById("speedValue"),
  expandAbbr: document.getElementById("expandAbbr"),
  normalizeRepeats: document.getElementById("normalizeRepeats"),
  removeEmoticons: document.getElementById("removeEmoticons"),
  fixTypos: document.getElementById("fixTypos"),
  addSpacing: document.getElementById("addSpacing"),
  filterProfanity: document.getElementById("filterProfanity"),
  chatInput: document.getElementById("chatInput"),
  sendChatBtn: document.getElementById("sendChatBtn"),
};

// WebSocket 연결
function connectWebSocket() {
  const wsUrl = "ws://localhost:3000/ws";

  elements.status.className = "status disconnected";
  elements.status.textContent = "연결 중...";

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    state.connected = true;
    elements.status.className = "status connected";
    elements.status.textContent = "✓ 연결됨";
    console.log("WebSocket connected");
  };

  state.ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleWebSocketMessage(message);
  };

  state.ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    elements.status.className = "status disconnected";
    elements.status.textContent = "✗ HTTP API 사용";
  };

  state.ws.onclose = () => {
    state.connected = false;
    elements.status.className = "status disconnected";
    elements.status.textContent = "✗ 재연결 중...";
    console.log("WebSocket disconnected");

    // 5초 후 재연결
    setTimeout(connectWebSocket, 5000);
  };
}

// WebSocket 메시지 처리
function handleWebSocketMessage(message) {
  console.log("Received message:", message);

  switch (message.type) {
    case "connected":
      console.log("Client ID:", message.clientId);
      break;

    case "pong":
      // Heartbeat response
      break;

    case "chat_original":
      // 원본 채팅 즉시 표시 (번역 전)
      handleOriginalChat(message.data);
      break;

    case "broadcast":
      // 번역 결과 수신 - 기존 메시지 업데이트
      handleTranslationUpdate(message.data);
      break;
  }
}

// 원본 채팅 즉시 표시 (번역 전)
function handleOriginalChat(data) {
  const username = data.username || "알수없음";
  const messageId = data.message_id;

  // 빈 메시지 제거
  const emptyMessage = elements.originalChat.querySelector('.empty-message, .loading-message');
  if (emptyMessage) {
    emptyMessage.remove();
  }

  // 채팅 객체 생성
  const chat = {
    username: username,
    text: data.text || ""
  };

  state.displayedChats.push(chat);

  // 채팅 메시지 DOM 생성 (한 줄 레이아웃)
  const messageDiv = document.createElement("div");
  messageDiv.className = "chat-message broadcast";
  messageDiv.dataset.messageId = messageId;
  messageDiv.innerHTML = `
    <span class="chat-header">
      <span class="chat-user">${escapeHtml(username)}:</span>
      <span class="broadcast-badge">🔴</span>
    </span>
    <span class="chat-original">
      <span class="chat-label">원본:</span>
      <span class="chat-text">${escapeHtml(chat.text)}</span>
    </span>
    <span class="chat-preprocessed">
      <span class="chat-label">전처리:</span>
      <span class="chat-text translating">...</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">번역:</span>
      <span class="chat-text translating">...</span>
    </span>
  `;

  elements.originalChat.appendChild(messageDiv);
  elements.originalChat.scrollTop = elements.originalChat.scrollHeight;

  // 메시지 카운트 업데이트
  elements.totalChats.textContent = state.displayedChats.length;
}

// 번역 결과로 기존 메시지 업데이트
function handleTranslationUpdate(data) {
  const metadata = data.metadata || {};
  const messageId = metadata.message_id;

  if (!messageId) {
    console.warn("No message_id in translation update");
    return;
  }

  // 메시지 ID로 DOM 찾기
  const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageDiv) {
    console.warn(`Message not found: ${messageId}`);
    return;
  }

  // 전처리 텍스트 업데이트
  const preprocessedText = messageDiv.querySelector(".chat-preprocessed .chat-text");
  preprocessedText.textContent = data.preprocessed_text || "";
  preprocessedText.classList.remove("translating");

  // 번역 결과 업데이트
  const translationText = messageDiv.querySelector(".chat-translation .chat-text");
  translationText.textContent = formatTranslations(data.translations || {});
  translationText.classList.remove("translating");

  // 통계 업데이트
  state.translatedCount++;
  if (data.processing_time) {
    state.totalTime += data.processing_time;
    elements.translatedCount.textContent = state.translatedCount;
    elements.avgTime.textContent = Math.round(state.totalTime / state.translatedCount) + "ms";
  }
}

// 번역 결과 포맷팅 (언어 태그 제거, 번역만 표시)
function formatTranslations(translations) {
  return Object.values(translations).join(" | ");
}

// 초기 데이터 로드
function initializeData() {
  elements.originalChat.innerHTML =
    '<div class="empty-message">채팅 시작 버튼을 눌러주세요</div>';
  elements.totalChats.textContent = state.chats.length;
}

// 채팅 시뮬레이션 시작
function startChatSimulation() {
  if (state.isSimulating) return;

  state.isSimulating = true;
  state.currentSimIndex = 0;
  state.displayedChats = [];

  elements.simulateBtn.disabled = true;
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = false;
  elements.originalChat.innerHTML = "";

  // 첫 채팅 바로 표시
  showNextChat();

  // 이후 주기적으로 표시
  state.simulateInterval = setInterval(() => {
    if (state.currentSimIndex >= state.chats.length) {
      // 모든 채팅 표시 완료
      clearInterval(state.simulateInterval);
      state.isSimulating = false;
      return;
    }
    showNextChat();
  }, state.chatSpeed);
}

// 다음 채팅 표시
function showNextChat() {
  if (state.currentSimIndex >= state.chats.length) return;

  const chat = state.chats[state.currentSimIndex];
  const currentIndex = state.currentSimIndex;
  state.displayedChats.push(chat);

  const messageDiv = document.createElement("div");
  messageDiv.className = "chat-message";
  messageDiv.dataset.index = currentIndex;
  messageDiv.innerHTML = `
    <span class="chat-header">
      <span class="chat-user">${escapeHtml(chat?.username)}:</span>
    </span>
    <span class="chat-original">
      <span class="chat-label">원본:</span>
      <span class="chat-text">${escapeHtml(chat.text)}</span>
    </span>
    <span class="chat-preprocessed">
      <span class="chat-label">전처리:</span>
      <span class="chat-text">-</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">번역:</span>
      <span class="chat-text">-</span>
    </span>
  `;

  elements.originalChat.appendChild(messageDiv);
  elements.originalChat.scrollTop = elements.originalChat.scrollHeight;

  state.currentSimIndex++;

  // 번역 중이면 바로 번역 요청 보내기
  if (state.isTranslating) {
    translateChat(currentIndex);
  }
}

// 개별 채팅 번역 (단일 언어)
async function translateChat(index) {
  if (!state.isTranslating) return;

  const chat = state.displayedChats[index];
  if (!chat) return;

  const messageDiv = document.querySelector(`[data-index="${index}"]`);
  if (!messageDiv) return;

  const options = {
    expandAbbreviations: elements.expandAbbr.checked,
    normalizeRepeats: elements.normalizeRepeats.checked,
    removeEmoticons: elements.removeEmoticons.checked,
    fixTypos: elements.fixTypos.checked,
    addSpacing: elements.addSpacing.checked,
    filterProfanity: elements.filterProfanity.checked,
  };

  try {
    const response = await fetch("http://localhost:3000/api/v1/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: chat.text,
        targetLanguages: [state.selectedLang],
        options: options,
      }),
    });

    const result = await response.json();

    if (result.success && result.data) {
      // 전처리된 텍스트 표시
      const preprocessedText = messageDiv.querySelector(".chat-preprocessed .chat-text");
      preprocessedText.textContent = result.data.preprocessed_text;

      // 번역 결과 표시
      if (
        result.data.translations &&
        result.data.translations[state.selectedLang]
      ) {
        const translationText = messageDiv.querySelector(".chat-translation .chat-text");
        translationText.textContent =
          result.data.translations[state.selectedLang];

        // 통계 업데이트
        state.translatedCount++;
        state.totalTime += result.data.processing_time;
        elements.translatedCount.textContent = state.translatedCount;
        elements.avgTime.textContent =
          Math.round(state.totalTime / state.translatedCount) + "ms";
      }
    } else {
      // 번역 실패 표시
      const translationText = messageDiv.querySelector(".chat-translation .chat-text");
      translationText.textContent = "⚠️ 실패";
      translationText.style.color = "#dc3545";
    }
  } catch (error) {
    console.error(`Translation error:`, error);
    const translationText = messageDiv.querySelector(".chat-translation .chat-text");
    translationText.textContent = "⚠️ 오류";
    translationText.style.color = "#dc3545";
  }
}

// 언어 선택 버튼 (단일 선택)
document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const lang = btn.dataset.lang;

    // 모든 버튼 비활성화
    document
      .querySelectorAll(".lang-btn")
      .forEach((b) => b.classList.remove("active"));

    // 선택된 버튼만 활성화
    btn.classList.add("active");
    state.selectedLang = lang;
  });
});

// 채팅 데이터셋 선택 버튼
document.querySelectorAll(".chat-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const chat = btn.dataset.chat;
    // 모든 버튼 비활성화
    document
      .querySelectorAll(".chat-btn")
      .forEach((b) => b.classList.remove("active"));

    // 선택된 버튼만 활성화
    btn.classList.add("active");
    state.chats = chat === "origin" ? SAMPLE_CHATS : RAG_SAMPLE_CHATS;
  });
});

// 속도 슬라이더
elements.speedSlider.addEventListener("input", (e) => {
  state.chatSpeed = parseInt(e.target.value);
  elements.speedValue.textContent = state.chatSpeed + "ms";
});

// 채팅 시작 버튼
elements.simulateBtn.addEventListener("click", () => {
  startChatSimulation();
});

// 번역 시작 버튼
elements.startBtn.addEventListener("click", () => {
  if (state.displayedChats.length === 0) {
    alert("채팅 시작 버튼을 먼저 눌러주세요.");
    return;
  }

  if (!state.selectedLang) {
    alert("번역할 언어를 선택하세요.");
    return;
  }

  if (!state.chats.length) {
    alert("채팅 데이터셋을 선택해줘.");
    return;
  }

  state.isTranslating = true;
  state.translationQueue = [];

  elements.startBtn.disabled = true;
  elements.stopBtn.disabled = false;
  elements.status.className = "status processing";
  elements.status.textContent = "⏳ 번역 중...";

  // 이미 표시된 모든 채팅에 대해 동시에 번역 시작
  for (let i = 0; i < state.displayedChats.length; i++) {
    translateChat(i);
  }
});

// 정지 버튼
elements.stopBtn.addEventListener("click", () => {
  state.isTranslating = false;
  state.isSimulating = false;

  if (state.simulateInterval) {
    clearInterval(state.simulateInterval);
    state.simulateInterval = null;
  }

  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  elements.status.className = "status connected";
  elements.status.textContent = "⏸ 정지됨";
});

// 초기화 버튼
elements.clearBtn.addEventListener("click", () => {
  state.isSimulating = false;
  state.isTranslating = false;
  state.currentSimIndex = 0;
  state.currentTransIndex = 0;
  state.translatedCount = 0;
  state.totalTime = 0;
  state.translationQueue = [];
  state.displayedChats = [];

  if (state.simulateInterval) {
    clearInterval(state.simulateInterval);
    state.simulateInterval = null;
  }

  elements.originalChat.innerHTML =
    '<div class="empty-message">채팅 시작 버튼을 눌러주세요</div>';
  elements.translatedCount.textContent = "0";
  elements.avgTime.textContent = "0ms";
  elements.simulateBtn.disabled = false;
  elements.startBtn.disabled = true;
  elements.stopBtn.disabled = true;
  elements.status.className = "status connected";
  elements.status.textContent = "✓ 초기화됨";
});

// 수동 채팅 추가 및 번역
async function sendManualChat() {
  const text = elements.chatInput.value.trim();

  if (!text) {
    return;
  }

  // 빈 메시지 제거
  const emptyMessage = elements.originalChat.querySelector('.empty-message, .loading-message');
  if (emptyMessage) {
    emptyMessage.remove();
  }

  // 채팅 객체 생성
  const chat = {
    username: "나",
    text: text
  };

  const currentIndex = state.displayedChats.length;
  state.displayedChats.push(chat);

  // 채팅 메시지 DOM 생성 (한 줄 레이아웃)
  const messageDiv = document.createElement("div");
  messageDiv.className = "chat-message";
  messageDiv.dataset.index = currentIndex;
  messageDiv.innerHTML = `
    <span class="chat-header">
      <span class="chat-user">${escapeHtml(chat.username)}:</span>
    </span>
    <span class="chat-original">
      <span class="chat-label">원본:</span>
      <span class="chat-text">${escapeHtml(chat.text)}</span>
    </span>
    <span class="chat-preprocessed">
      <span class="chat-label">전처리:</span>
      <span class="chat-text">-</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">번역:</span>
      <span class="chat-text">-</span>
    </span>
  `;

  elements.originalChat.appendChild(messageDiv);
  elements.originalChat.scrollTop = elements.originalChat.scrollHeight;

  // 입력창 초기화
  elements.chatInput.value = "";

  // 메시지 카운트 업데이트
  elements.totalChats.textContent = state.displayedChats.length;

  // 번역 시작 버튼 활성화
  elements.startBtn.disabled = false;

  // 번역이 이미 시작된 경우 바로 번역
  if (state.isTranslating) {
    await translateChat(currentIndex);
  }
}

// 채팅 전송 버튼
elements.sendChatBtn.addEventListener("click", sendManualChat);

// 엔터키로 채팅 전송
elements.chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendManualChat();
  }
});

// HTML 이스케이프
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Heartbeat
setInterval(() => {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "ping" }));
  }
}, 30000);

// 초기화
connectWebSocket();
initializeData();
