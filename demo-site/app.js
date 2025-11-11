// 전역 상태 (SAMPLE_CHATS는 chat-data.js에서 로드됨)
const state = {
  ws: null,
  chats: SAMPLE_CHATS,
  displayedChats: [],
  allSimulatedChats: [], // 시뮬레이션된 모든 채팅 (삭제 안 함, 번역용)
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
  maxDisplayedChats: 500, // 최대 표시 채팅 개수
  completionTimestamps: [], // RPS 계산용 타임스탬프 배열
  currentRPS: 0,
  messageCache: new Map(), // DOM 요소 캐싱으로 성능 개선
  xlsxData: [], // XLSX 내보내기용 데이터
  preprocessingCache: new Map(), // 전처리 데이터 캐싱 (jobId → preprocessing data)
};

// DOM 요소
const elements = {
  originalChat: document.getElementById("originalChat"),
  status: document.getElementById("status"),
  totalChats: document.getElementById("totalChats"),
  translatedCount: document.getElementById("translatedCount"),
  avgTime: document.getElementById("avgTime"),
  rpsValue: document.getElementById("rpsValue"),
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
  downloadXlsxBtn: document.getElementById("downloadXlsxBtn"),
};

// RPS 계산 (최근 5초 기준)
function calculateRPS() {
  const now = Date.now();
  const windowMs = 5000; // 5초 윈도우

  // 5초 이내의 완료 타임스탬프만 유지
  state.completionTimestamps = state.completionTimestamps.filter(
    (timestamp) => now - timestamp < windowMs
  );

  // RPS 계산: 5초 동안의 완료 수 / 5초
  const completionsInWindow = state.completionTimestamps.length;
  state.currentRPS = completionsInWindow / (windowMs / 1000);

  // UI 업데이트
  elements.rpsValue.textContent = state.currentRPS.toFixed(1);
}

// 번역 완료 기록
function recordCompletion() {
  state.completionTimestamps.push(Date.now());
  calculateRPS();
}

// 오래된 채팅 정리 (100개 초과 시)
function cleanupOldChats() {
  const chatMessages = elements.originalChat.querySelectorAll(".chat-message");

  if (chatMessages.length > state.maxDisplayedChats) {
    const deleteCount = chatMessages.length - state.maxDisplayedChats;

    // 오래된 메시지부터 삭제
    for (let i = 0; i < deleteCount; i++) {
      if (chatMessages[i]) {
        // 캐시에서도 제거 (메모리 누수 방지)
        const jobId = chatMessages[i].getAttribute("data-job-id");
        const messageId = chatMessages[i].getAttribute("data-message-id");
        if (jobId) {
          state.messageCache.delete(jobId);
        }
        if (messageId) {
          state.messageCache.delete(messageId);
        }
        chatMessages[i].remove();
      }
    }

    // displayedChats 배열도 정리
    if (state.displayedChats.length > state.maxDisplayedChats) {
      state.displayedChats = state.displayedChats.slice(
        -state.maxDisplayedChats
      );
    }

    console.log(
      `🗑️ Cleaned up ${deleteCount} old messages (keeping ${state.maxDisplayedChats})`
    );
  }
}

// WebSocket 연결
function connectWebSocket() {
  const wsUrl = "ws://localhost:3000/ws";
  // const wsUrl = "wss://3000-01k7redychy4yr660skfrd1nqc.cloudspaces.litng.ai/ws";

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
  switch (message.type) {
    case "connected":
      console.log("✅ WebSocket connected:", message.clientId);
      break;

    case "pong":
      // Heartbeat response
      break;

    case "queued":
      // 번역 작업이 큐에 등록됨
      break;

    case "preprocessing-complete":
      // 전처리 완료 - 전처리 텍스트 표시
      handlePreprocessingComplete(message.jobId, message.data);
      break;

    case "partial-translation":
      // 각 언어별 번역 완료 - 즉시 화면에 표시
      handlePreprocessingComplete(message.jobId, message.data);
      handlePartialTranslation(message.jobId, message.data);
      break;

    case "translation-complete":
      // 모든 언어 번역 완료
      handleTranslationComplete(message.jobId, message.data);
      break;

    case "partial-error":
      // 특정 언어 번역 실패
      handlePartialError(message.jobId, message.data);
      break;

    case "error":
      // 전체 에러
      handleTranslationError(message.jobId, message.error);
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
  const emptyMessage = elements.originalChat.querySelector(
    ".empty-message, .loading-message"
  );
  if (emptyMessage) {
    emptyMessage.remove();
  }

  // 채팅 객체 생성
  const chat = {
    username: username,
    text: data.text || "",
  };

  state.displayedChats.push(chat);

  // 채팅 메시지 DOM 생성 (4개 언어 필드)
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
      <span class="chat-text">-</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">🇺🇸 EN:</span>
      <span class="chat-text" data-lang="en">⏳</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">🇹🇭 TH:</span>
      <span class="chat-text" data-lang="th">⏳</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">🇨🇳 CN:</span>
      <span class="chat-text" data-lang="zh-CN">⏳</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">🇹🇼 TW:</span>
      <span class="chat-text" data-lang="zh-TW">⏳</span>
    </span>
  `;

  elements.originalChat.appendChild(messageDiv);
  elements.originalChat.scrollTop = elements.originalChat.scrollHeight;

  // 메시지 캐시에 추가 (성능 최적화)
  if (messageId) {
    state.messageCache.set(messageId, messageDiv);
  }

  // 메시지 카운트 업데이트
  elements.totalChats.textContent = state.displayedChats.length;

  // 오래된 채팅 정리 (100개 초과 시)
  cleanupOldChats();
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
  const preprocessedText = messageDiv.querySelector(
    ".chat-preprocessed .chat-text"
  );
  preprocessedText.textContent = data.preprocessedText || "";
  preprocessedText.classList.remove("translating");

  // 번역 결과 업데이트
  const translationText = messageDiv.querySelector(
    ".chat-translation .chat-text"
  );
  translationText.textContent = formatTranslations(data.translations || {});
  translationText.classList.remove("translating");

  // 통계 업데이트
  state.translatedCount++;
  if (data.timings && data.timings.total_ms) {
    state.totalTime += data.timings.total_ms;
    elements.translatedCount.textContent = state.translatedCount;
    elements.avgTime.textContent =
      Math.round(state.totalTime / state.translatedCount) + "ms";
  }

  // RPS 기록
  recordCompletion();

  // XLSX 로깅용 데이터 추가 (data에 모든 정보 포함됨)
  if (originalText && translation) {
    const xlsxRow = {
      timestamp: new Date().toISOString(),
      original_text: originalText,
      preprocessed_text: data.preprocessedText,
      detected_language: data.detectedLanguage,
      translation_lang: language,
      translation_text: translation,
      total_time_ms: data.total_ms || -1,
      // total_gateway_time_ms: data.total_ms || -1,
      preprocessing_time_ms: data.preprocessing_ms || -1,
      total_cache_server_time_ms: data.cache_processing_ms || -1,
      cache_hits: data.cacheHit || false,
      // cache_processing_ms: data.cache_processing_ms || -1,
      cache_lookup_ms: data.cache_lookup_time_ms || -1,
      llm_response_time_ms: data.llm_response_time_ms[language] || -1,
      filtered: data.filtered || false,
      filter_reason: data.filter_reason || "",
    };
    state.xlsxData.push(xlsxRow);
  } else {
    console.warn("⚠️ Missing originalText or translation:", data);
  }
}

// 번역 결과 포맷팅 (언어 태그 제거, 번역만 표시)
function formatTranslations(translations) {
  return Object.values(translations).join(" | ");
}

// WebSocket 스트리밍: 전처리 완료 처리
function handlePreprocessingComplete(jobId, data) {
  // 캐시에서 메시지 찾기 (성능 최적화)
  let messageDiv = state.messageCache.get(jobId);

  // 캐시에 없으면 DOM 검색
  if (!messageDiv) {
    messageDiv = document.querySelector(`[data-job-id="${jobId}"]`);

    if (!messageDiv && data.metadata?.message_id) {
      messageDiv = document.querySelector(
        `[data-message-id="${data.metadata.message_id}"]`
      );
    }

    if (!messageDiv) {
      return;
    }

    // 캐시에 저장
    state.messageCache.set(jobId, messageDiv);
  }

  // 전처리 텍스트 즉시 표시
  const preprocessedTextEl = messageDiv.querySelector(
    ".chat-preprocessed .chat-text"
  );
  if (preprocessedTextEl) {
    preprocessedTextEl.textContent = data.preprocessedText;
  }

  // XLSX 로깅용 전처리 데이터 캐싱
  state.preprocessingCache.set(jobId, {
    originalText: data.originalText,
    preprocessedText: data.preprocessedText,
    detectedLanguage: data.detectedLanguage,
    preprocessingMs: data.preprocessing_ms,
    metadata: data.metadata,
  });
}

// WebSocket 스트리밍: 각 언어별 번역 완료 (실시간 표시)
function handlePartialTranslation(jobId, data) {
  const { language, translation, metadata } = data;

  // 캐시에서 메시지 찾기 (성능 최적화)
  let messageDiv = state.messageCache.get(jobId);

  // 캐시에 없으면 DOM 검색
  if (!messageDiv) {
    messageDiv = document.querySelector(`[data-job-id="${jobId}"]`);

    if (!messageDiv && metadata?.message_id) {
      messageDiv = document.querySelector(
        `[data-message-id="${metadata.message_id}"]`
      );
    }

    if (!messageDiv) {
      console.warn(`Message not found: ${jobId}`);
      return;
    }

    // 캐시에 저장
    state.messageCache.set(jobId, messageDiv);
  }

  // 해당 언어 필드 즉시 업데이트
  const translationText = messageDiv.querySelector(
    `.chat-translation .chat-text[data-lang="${language}"]`
  );

  const originalText = messageDiv.querySelector(
    `.chat-original .chat-text`
  ).textContent;

  if (translationText) {
    translationText.textContent = translation;

    // 완료 시 초록색으로 강조 (200ms)
    translationText.style.color = "#28a745";
    translationText.style.fontWeight = "bold";

    setTimeout(() => {
      translationText.style.color = "";
      translationText.style.fontWeight = "";
    }, 200);
  }

  // 통계 업데이트 (각 언어별로)
  state.translatedCount++;
  state.totalTime += data.total_ms;

  elements.translatedCount.textContent = state.translatedCount;
  elements.avgTime.textContent =
    Math.round(state.totalTime / state.translatedCount) + "ms";

  // RPS 기록
  recordCompletion();

  // XLSX 로깅용 데이터 추가 (data에 모든 정보 포함됨)
  if (originalText && translation) {
    const xlsxRow = {
      timestamp: new Date().toISOString(),
      original_text: originalText,
      preprocessed_text: data.preprocessedText,
      detected_language: data.detectedLanguage,
      translation_lang: language,
      translation_text: translation,
      total_time_ms: data.total_ms || -1,
      // total_gateway_time_ms: data.total_ms || -1,
      preprocessing_time_ms: data.preprocessing_ms || -1,
      total_cache_server_time_ms: data.cache_processing_ms || -1,
      cache_hits: data.cacheHit || false,
      // cache_processing_ms: data.cache_processing_ms || -1,
      cache_lookup_ms: data.cache_lookup_time_ms || -1,
      llm_response_time_ms: data.llm_response_time_ms[language] || -1,
      filtered: data.filtered || false,
      filter_reason: data.filter_reason || "",
    };
    state.xlsxData.push(xlsxRow);
  } else {
    console.warn("⚠️ Missing preprocessing data in partial-translation:", data);
  }
}

// WebSocket 스트리밍: 모든 언어 번역 완료
function handleTranslationComplete(jobId, data) {
  console.log(`[${jobId}] All translations complete:`, data);

  // 최종 완료 처리는 이미 partial-translation에서 각각 완료됨
  // 필요시 추가 처리 (예: 완료 애니메이션)
}

// WebSocket 스트리밍: 특정 언어 번역 에러
function handlePartialError(jobId, data) {
  const { language, error } = data;
  console.error(`[${jobId}] ${language} translation error:`, error);

  const messageDiv = document.querySelector(`[data-job-id="${jobId}"]`);
  if (!messageDiv) return;

  const translationText = messageDiv.querySelector(
    `.chat-translation .chat-text[data-lang="${language}"]`
  );

  if (translationText) {
    translationText.textContent = "⚠️";
    translationText.style.color = "#dc3545";
  }
}

// WebSocket 스트리밍: 전체 에러
function handleTranslationError(jobId, error) {
  console.error(`[${jobId}] Translation error:`, error);

  const messageDiv = document.querySelector(`[data-job-id="${jobId}"]`);
  if (!messageDiv) return;

  // 모든 언어 필드를 에러 표시
  const languages = ["en", "th", "zh-CN", "zh-TW"];
  languages.forEach((lang) => {
    const translationText = messageDiv.querySelector(
      `.chat-translation .chat-text[data-lang="${lang}"]`
    );
    if (translationText) {
      translationText.textContent = "⚠️";
      translationText.style.color = "#dc3545";
    }
  });
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
  state.allSimulatedChats = []; // 전체 시뮬레이션 목록 초기화

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
  state.allSimulatedChats.push(chat); // 번역용 전체 목록에 추가

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
      <span class="chat-label">🇺🇸 EN:</span>
      <span class="chat-text" data-lang="en">...</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">🇹🇭 TH:</span>
      <span class="chat-text" data-lang="th">...</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">🇨🇳 CN:</span>
      <span class="chat-text" data-lang="zh-CN">...</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">🇹🇼 TW:</span>
      <span class="chat-text" data-lang="zh-TW">...</span>
    </span>
  `;

  elements.originalChat.appendChild(messageDiv);
  elements.originalChat.scrollTop = elements.originalChat.scrollHeight;

  state.currentSimIndex++;

  // 오래된 채팅 정리 (100개 초과 시)
  cleanupOldChats();

  // 번역 중이면 바로 번역 요청 보내기
  if (state.isTranslating) {
    translateChat(currentIndex);
  }
}

// 개별 채팅 번역 (4개 언어별로 독립적인 HTTP 요청)
async function translateChat(index) {
  // if (!state.isTranslating) return;

  const chat = state.allSimulatedChats[index]; // 전체 시뮬레이션 목록에서 가져오기
  if (!chat) return;

  const messageDiv = document.querySelector(`[data-index="${index}"]`);
  // messageDiv가 없어도 번역은 진행 (XLSX 데이터 수집용)

  const options = {
    expandAbbreviations: elements.expandAbbr.checked,
    normalizeRepeats: elements.normalizeRepeats.checked,
    removeEmoticons: elements.removeEmoticons.checked,
    fixTypos: elements.fixTypos.checked,
    addSpacing: elements.addSpacing.checked,
    filterProfanity: elements.filterProfanity.checked,
  };

  const languages = ["en", "th", "zh-CN", "zh-TW"];
  let preprocessedText = "";

  // 번역 시작 전 모든 언어 필드를 "로딩 중" 상태로 표시
  languages.forEach((lang) => {
    const translationText = messageDiv.querySelector(
      `.chat-translation .chat-text[data-lang="${lang}"]`
    );
    if (translationText) {
      translationText.textContent = "⏳";
      translationText.style.color = "#007bff"; // 파란색 (로딩 중)
    }
  });

  // 4개 언어에 대해 병렬로 개별 HTTP 요청 보내기
  const requests = languages.map((lang) => {
    const langStartTime = performance.now();

    return fetch("http://localhost:3000/api/v1/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: chat.text,
        targetLanguages: [lang], // 각 언어별로 개별 요청
        options: options,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        const langDuration = performance.now() - langStartTime;
        console.log(
          `[${lang}] 번역 완료: ${langDuration.toFixed(1)}ms`,
          result
        );

        if (result.success && result.data) {
          const { translation, preprocessedText } = result.data[lang];
          console.log(`[${lang}] 번역 데이터:`, translation);

          // 전처리 텍스트 저장 및 즉시 업데이트 (첫 번째 응답만)
          if (!preprocessedText) {
            preprocessedText = preprocessedText || "";

            // DOM이 있을 때만 업데이트
            if (messageDiv) {
              const preprocessedTextEl = messageDiv.querySelector(
                ".chat-preprocessed .chat-text"
              );
              if (preprocessedTextEl) {
                preprocessedTextEl.textContent = preprocessedText;
                console.log(
                  `[${lang}] 전처리 텍스트 업데이트:`,
                  preprocessedText
                );
              } else {
                console.warn(`[${lang}] 전처리 텍스트 요소를 찾을 수 없음`);
              }
            }
          }

          // 번역 결과가 들어오는 즉시 해당 언어 필드 업데이트
          if (translation) {
            // DOM이 있을 때만 업데이트
            if (messageDiv) {
              const translationText = messageDiv.querySelector(
                `.chat-translation .chat-text[data-lang="${lang}"]`
              );

              console.log(`[${lang}] 번역 요소 찾기:`, translationText);
              console.log(`[${lang}] 번역 텍스트:`, translation);

              if (translationText) {
                translationText.textContent = translation;
                console.log(`[${lang}] ✅ 번역 표시 완료:`, translation);

                // 완료 시 초록색으로 강조 (200ms)
                translationText.style.color = "#28a745";
                translationText.style.fontWeight = "bold";

                setTimeout(() => {
                  translationText.style.color = "";
                  translationText.style.fontWeight = "";
                }, 200);
              } else {
                console.error(`[${lang}] ⚠️ 번역 요소를 찾을 수 없음!`);
                console.log("messageDiv:", messageDiv);
                console.log(
                  "모든 .chat-translation 요소:",
                  messageDiv.querySelectorAll(".chat-translation")
                );
              }
            }
          } else {
            console.warn(`[${lang}] ⚠️ 번역 결과가 없음:`, translation);
          }

          // 통계 업데이트 (각 언어별로)
          state.translatedCount++;
          const processingTime = result.data[lang].total_ms;
          state.totalTime += processingTime;

          elements.translatedCount.textContent = state.translatedCount;
          elements.avgTime.textContent =
            Math.round(state.totalTime / state.translatedCount) + "ms";

          // RPS 기록
          recordCompletion();

          // XLSX 로깅용 데이터 추가 (data에 모든 정보 포함됨)
          if (translation) {
            const {
              originalText,
              detectedLanguage,
              preprocessedText,
              cache_hit,
              preprocessing_ms,
              cache_processing_ms,
              cache_lookup_time_ms,
              llm_response_time_ms,
              filtered,
              filter_reason,
            } = result.data[lang];
            const xlsxRow = {
              timestamp: new Date().toISOString(),
              original_text: originalText,
              preprocessed_text: preprocessedText,
              detected_language: detectedLanguage,
              translation_lang: lang,
              translation_text: translation,
              total_time_ms: processingTime || -1,
              preprocessing_time_ms: preprocessing_ms || -1,
              total_cache_server_time_ms: cache_processing_ms || -1,
              cache_hits: cache_hit || false,
              llm_response_time_ms: llm_response_time_ms[lang] || -1,
              cache_lookup_ms: cache_lookup_time_ms || -1,
              filtered: filtered || false,
              filter_reason: filter_reason || "",
            };
            state.xlsxData.push(xlsxRow);
          } else {
            console.warn("⚠️ Missing http response data:", result.data);
          }
          return result;
        }
        return null;
      })
      .catch((error) => {
        console.error(`Translation error for ${lang}:`, error);

        // 오류 표시
        const translationText = messageDiv.querySelector(
          `.chat-translation .chat-text[data-lang="${lang}"]`
        );
        if (translationText) {
          translationText.textContent = "⚠️";
          translationText.style.color = "#dc3545";
        }
        return null;
      });
  });

  // 모든 요청 완료 대기 (이미 UI는 각각 업데이트됨)
  await Promise.all(requests);
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

    // 채팅 데이터셋 선택
    if (chat === "origin") {
      state.chats = SAMPLE_CHATS;
    } else if (chat === "rag") {
      state.chats = RAG_SAMPLE_CHATS;
    } else if (chat === "vs4b") {
      state.chats = VS_4B_CHATS;
    }
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
  if (state.allSimulatedChats.length === 0) {
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

  // 시뮬레이션된 모든 채팅에 대해 번역 시작 (화면에 표시되지 않은 것도 포함)
  for (let i = 0; i < state.allSimulatedChats.length; i++) {
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
  state.allSimulatedChats = []; // 전체 시뮬레이션 목록 초기화
  state.completionTimestamps = [];
  state.currentRPS = 0;
  state.messageCache.clear(); // 캐시 초기화
  state.xlsxData = []; // XLSX 데이터 초기화
  state.preprocessingCache.clear(); // 전처리 캐시 초기화

  if (state.simulateInterval) {
    clearInterval(state.simulateInterval);
    state.simulateInterval = null;
  }

  elements.originalChat.innerHTML =
    '<div class="empty-message">채팅 시작 버튼을 눌러주세요</div>';
  elements.translatedCount.textContent = "0";
  elements.avgTime.textContent = "0ms";
  elements.rpsValue.textContent = "0.0";
  elements.simulateBtn.disabled = false;
  elements.startBtn.disabled = true;
  elements.stopBtn.disabled = true;
  elements.status.className = "status connected";
  elements.status.textContent = "✓ 초기화됨";
});

// XLSX 다운로드 버튼
elements.downloadXlsxBtn.addEventListener("click", () => {
  downloadXlsx();
});

// XLSX 다운로드 함수
function downloadXlsx() {
  if (state.xlsxData.length === 0) {
    alert("다운로드할 번역 데이터가 없습니다.");
    return;
  }

  try {
    // 워크북 생성
    const wb = XLSX.utils.book_new();

    // 워크시트 생성 (헤더 포함)
    const ws = XLSX.utils.json_to_sheet(state.xlsxData, {
      header: [
        "timestamp",
        "original_text",
        "preprocessed_text",
        "detected_language",
        "translation_lang",
        "translation_text",
        "total_time_ms",
        // "total_gateway_time_ms",
        "preprocessing_time_ms",
        "total_cache_server_time_ms",
        "cache_hits",
        "cache_lookup_ms",
        "llm_response_time_ms",
        "filtered",
        "filter_reason",
      ],
    });

    // 컬럼 너비 설정
    ws["!cols"] = [
      { wch: 20 }, // timestamp
      { wch: 50 }, // original_text
      { wch: 50 }, // preprocessed_text
      { wch: 15 }, // detected_language
      { wch: 15 }, // translation_lang
      { wch: 50 }, // translation_text
      { wch: 15 }, // total_time_ms
      { wch: 20 }, // preprocessing_time_ms
      { wch: 20 }, // translation_time_ms
      { wch: 12 }, // cache_hits
      { wch: 20 }, // cache_processing_ms
      { wch: 10 }, // filtered
      { wch: 30 }, // filter_reason
    ];

    // 워크북에 시트 추가
    XLSX.utils.book_append_sheet(wb, ws, "Translations");

    // 파일명 생성 (날짜 포함)
    const today = new Date().toISOString().split("T")[0];
    const filename = `translations_${today}.xlsx`;

    // 다운로드
    XLSX.writeFile(wb, filename);

    console.log(
      `✅ XLSX 파일 다운로드: ${filename} (${state.xlsxData.length}개 로우)`
    );
  } catch (error) {
    console.error("XLSX 다운로드 실패:", error);
    alert("XLSX 파일 생성에 실패했습니다.");
  }
}

// 수동 채팅 추가 및 번역
async function sendManualChat() {
  const text = elements.chatInput.value.trim();

  if (!text) {
    return;
  }

  // 빈 메시지 제거
  const emptyMessage = elements.originalChat.querySelector(
    ".empty-message, .loading-message"
  );
  if (emptyMessage) {
    emptyMessage.remove();
  }

  // 채팅 객체 생성
  const chat = {
    username: "나",
    text: text,
  };

  const currentIndex = state.allSimulatedChats.length; // 전체 목록 기준 인덱스
  state.displayedChats.push(chat);
  state.allSimulatedChats.push(chat); // 번역용 전체 목록에도 추가

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
      <span class="chat-label">🇺🇸 EN:</span>
      <span class="chat-text" data-lang="en">...</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">🇹🇭 TH:</span>
      <span class="chat-text" data-lang="th">...</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">🇨🇳 CN:</span>
      <span class="chat-text" data-lang="zh-CN">...</span>
    </span>
    <span class="chat-translation">
      <span class="chat-label">🇹🇼 TW:</span>
      <span class="chat-text" data-lang="zh-TW">...</span>
    </span>
  `;

  elements.originalChat.appendChild(messageDiv);
  elements.originalChat.scrollTop = elements.originalChat.scrollHeight;

  // 입력창 초기화
  elements.chatInput.value = "";

  // 메시지 카운트 업데이트
  elements.totalChats.textContent = state.displayedChats.length;

  // 오래된 채팅 정리 (100개 초과 시)
  cleanupOldChats();

  // 번역 시작 버튼 활성화
  elements.startBtn.disabled = false;

  console.log(state.isTranslating, "@@");
  // 번역이 이미 시작된 경우 바로 번역
  // if (state.isTranslating) {
  await translateChat(currentIndex);
  // }
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

// RPS 주기적 업데이트 (500ms마다)
setInterval(() => {
  calculateRPS();
}, 500);

// 초기화
connectWebSocket();
initializeData();
