interface SpellCheckResult {
    original: string;
    hasErrors: boolean;
    errors: Array<{
        word: string;
        position: number;
        suggestions: string[];
    }>;
}
declare class SpellCheckService {
    private spell;
    private isInitialized;
    constructor();
    private initialize;
    /**
     * 텍스트의 맞춤법 검사
     */
    check(text: string): SpellCheckResult;
    /**
     * 단어 하나만 검사
     */
    checkWord(word: string): boolean;
    /**
     * 단어에 대한 제안 가져오기
     */
    suggest(word: string): string[];
    /**
     * 초기화 상태 확인
     */
    isReady(): boolean;
}
export declare const spellCheckService: SpellCheckService;
export {};
//# sourceMappingURL=spellcheck.service.d.ts.map