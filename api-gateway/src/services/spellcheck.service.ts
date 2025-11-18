// import nspell from 'nspell';
// import { logger } from '../utils/logger';

// interface SpellCheckResult {
//   original: string;
//   hasErrors: boolean;
//   errors: Array<{
//     word: string;
//     position: number;
//     suggestions: string[];
//   }>;
// }

// class SpellCheckService {
//   private spell: any = null;
//   private isInitialized = false;

//   constructor() {
//     this.initialize();
//   }

//   private async initialize() {
//     try {
//       // dictionary-ko는 ESM 모듈이므로 동적 import 사용
//       // dictionary-ko는 {aff: Buffer, dic: Buffer} 형태를 반환
//       const dictionaryKo = await import('dictionary-ko');
//       const dict = dictionaryKo.default;

//       // nspell 인스턴스 생성
//       this.spell = nspell(dict);
//       this.isInitialized = true;
//       logger.info('✅ Korean spell checker initialized');
//     } catch (error) {
//       logger.error({ error }, 'Failed to initialize spell checker');
//     }
//   }

//   /**
//    * 텍스트의 맞춤법 검사
//    */
//   public check(text: string): SpellCheckResult {
//     const result: SpellCheckResult = {
//       original: text,
//       hasErrors: false,
//       errors: [],
//     };

//     if (!this.isInitialized || !this.spell) {
//       logger.warn('Spell checker not initialized yet');
//       return result;
//     }

//     // 단어 단위로 분리 (한글, 영어, 숫자)
//     const words = text.match(/[\uAC00-\uD7AF]+|[a-zA-Z]+|\d+/g) || [];
//     let currentPosition = 0;

//     for (const word of words) {
//       // 현재 단어의 위치 찾기
//       const position = text.indexOf(word, currentPosition);
//       currentPosition = position + word.length;

//       // 한글 단어만 검사 (2글자 이상)
//       if (/[\uAC00-\uD7AF]+/.test(word) && word.length >= 2) {
//         const isCorrect = this.spell.correct(word);

//         if (!isCorrect) {
//           result.hasErrors = true;
//           const suggestions = this.spell.suggest(word).slice(0, 5); // 최대 5개 제안

//           result.errors.push({
//             word,
//             position,
//             suggestions,
//           });
//         }
//       }
//     }

//     return result;
//   }

//   /**
//    * 단어 하나만 검사
//    */
//   public checkWord(word: string): boolean {
//     if (!this.isInitialized || !this.spell) {
//       return true; // 초기화 안됐으면 일단 맞다고 가정
//     }

//     return this.spell.correct(word);
//   }

//   /**
//    * 단어에 대한 제안 가져오기
//    */
//   public suggest(word: string): string[] {
//     if (!this.isInitialized || !this.spell) {
//       return [];
//     }

//     return this.spell.suggest(word);
//   }

//   /**
//    * 초기화 상태 확인
//    */
//   public isReady(): boolean {
//     return this.isInitialized && this.spell !== null;
//   }
// }

// // 싱글톤 인스턴스 export
// export const spellCheckService = new SpellCheckService();
