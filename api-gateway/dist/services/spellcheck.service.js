"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.spellCheckService = void 0;
const nspell_1 = __importDefault(require("nspell"));
const logger_1 = require("../utils/logger");
class SpellCheckService {
    spell = null;
    isInitialized = false;
    constructor() {
        this.initialize();
    }
    async initialize() {
        try {
            // dictionary-ko는 ESM 모듈이므로 동적 import 사용
            // dictionary-ko는 {aff: Buffer, dic: Buffer} 형태를 반환
            const dictionaryKo = await Promise.resolve().then(() => __importStar(require('dictionary-ko')));
            const dict = dictionaryKo.default;
            // nspell 인스턴스 생성
            this.spell = (0, nspell_1.default)(dict);
            this.isInitialized = true;
            logger_1.logger.info('✅ Korean spell checker initialized');
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Failed to initialize spell checker');
        }
    }
    /**
     * 텍스트의 맞춤법 검사
     */
    check(text) {
        const result = {
            original: text,
            hasErrors: false,
            errors: [],
        };
        if (!this.isInitialized || !this.spell) {
            logger_1.logger.warn('Spell checker not initialized yet');
            return result;
        }
        // 단어 단위로 분리 (한글, 영어, 숫자)
        const words = text.match(/[\uAC00-\uD7AF]+|[a-zA-Z]+|\d+/g) || [];
        let currentPosition = 0;
        for (const word of words) {
            // 현재 단어의 위치 찾기
            const position = text.indexOf(word, currentPosition);
            currentPosition = position + word.length;
            // 한글 단어만 검사 (2글자 이상)
            if (/[\uAC00-\uD7AF]+/.test(word) && word.length >= 2) {
                const isCorrect = this.spell.correct(word);
                if (!isCorrect) {
                    result.hasErrors = true;
                    const suggestions = this.spell.suggest(word).slice(0, 5); // 최대 5개 제안
                    result.errors.push({
                        word,
                        position,
                        suggestions,
                    });
                }
            }
        }
        return result;
    }
    /**
     * 단어 하나만 검사
     */
    checkWord(word) {
        if (!this.isInitialized || !this.spell) {
            return true; // 초기화 안됐으면 일단 맞다고 가정
        }
        return this.spell.correct(word);
    }
    /**
     * 단어에 대한 제안 가져오기
     */
    suggest(word) {
        if (!this.isInitialized || !this.spell) {
            return [];
        }
        return this.spell.suggest(word);
    }
    /**
     * 초기화 상태 확인
     */
    isReady() {
        return this.isInitialized && this.spell !== null;
    }
}
// 싱글톤 인스턴스 export
exports.spellCheckService = new SpellCheckService();
//# sourceMappingURL=spellcheck.service.js.map