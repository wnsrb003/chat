#!/usr/bin/env node

/**
 * gRPC Translation Client Example
 *
 * This script demonstrates how to connect to the translation gRPC server
 * and perform translation requests using various methods.
 */

const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

// Load the proto file
const PROTO_PATH = path.join(__dirname, "proto", "translation.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const translation = grpc.loadPackageDefinition(packageDefinition).translation;

// gRPC server configuration
const SERVER_ADDRESS = "192.168.190.158:50051";

class TranslationGRPCClient {
  constructor(serverAddress = SERVER_ADDRESS) {
    this.client = new translation.TranslationService(
      serverAddress,
      grpc.credentials.createInsecure()
    );
  }

  /**
   * Health check to verify server connectivity
   */
  async healthCheck() {
    return new Promise((resolve, reject) => {
      const request = {};

      this.client.HealthCheck(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Single translation request
   */
  async translate(text, sourceLang = "ko", targetLangs = ["en"], options = {}) {
    return new Promise((resolve, reject) => {
      const request = {
        text: text,
        source_lang: sourceLang,
        target_langs: targetLangs,
        use_cache: options.useCache !== undefined ? options.useCache : true,
        cache_strategy: options.cacheStrategy || "hybrid",
        translator_name: options.translatorName || "vllm",
      };

      console.log(
        "📤 Sending translation request:",
        JSON.stringify(request, null, 2)
      );

      this.client.Translate(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Batch translation request
   */
  async batchTranslate(requests) {
    return new Promise((resolve, reject) => {
      const batchRequest = {
        requests: requests,
      };

      console.log(
        "📤 Sending batch translation request with",
        requests.length,
        "items"
      );

      this.client.BatchTranslate(batchRequest, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return new Promise((resolve, reject) => {
      const request = {};

      this.client.GetCacheStats(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Clear cache
   */
  async clearCache(cacheType = "all") {
    return new Promise((resolve, reject) => {
      const request = {
        cache_type: cacheType,
      };

      this.client.ClearCache(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Close the client connection
   */
  close() {
    this.client.close();
  }
}

/**
 * Test functions
 */
async function runTests() {
  const client = new TranslationGRPCClient();

  try {
    console.log("🔄 Starting gRPC Translation Client Tests...\n");

    // 1. Health Check
    console.log("1️⃣ Health Check Test:");
    try {
      const healthResponse = await client.healthCheck();
      console.log("✅ Health check passed:", healthResponse);
    } catch (error) {
      console.log("❌ Health check failed:", error.message);
    }
    console.log("");

    // 2. Simple Translation Test
    console.log("2️⃣ Simple Translation Test:");
    try {
      const response = await client.translate("안녕하세요", "ko", ["en"]);
      console.log("✅ Translation successful:");
      console.log("   Original:", response.original_text);
      console.log("   Source Lang:", response.source_lang);
      console.log("   Translations:", response.translations);
      console.log("   Cache Hits:", response.cache_hits);
      console.log("   Processing Time:", response.processing_time_ms, "ms");
    } catch (error) {
      console.log("❌ Translation failed:", error.message);
    }
    console.log("");

    // 3. Multiple Target Languages Test
    console.log("3️⃣ Multiple Target Languages Test:");
    try {
      const response = await client.translate("좋은 하루 되세요", "ko", [
        "en",
        "ja",
        "zh",
      ]);
      console.log("✅ Multi-language translation successful:");
      console.log("   Translations:", response.translations);
      console.log("   Cache Hits:", response.cache_hits);
    } catch (error) {
      console.log("❌ Multi-language translation failed:", error.message);
    }
    console.log("");

    // 4. Sentence Separator Test (|||)
    console.log("4️⃣ Sentence Separator Test (|||):");
    try {
      const response = await client.translate(
        "안녕하세요 ||| 좋은 하루 되세요 ||| 감사합니다",
        "ko",
        ["en"]
      );
      console.log("✅ Sentence separator translation successful:");
      console.log("   Original:", response.original_text);
      console.log("   Translation:", response.translations);
      console.log("   Processing Time:", response.processing_time_ms, "ms");
    } catch (error) {
      console.log("❌ Sentence separator translation failed:", error.message);
    }
    console.log("");

    // 5. Cache Strategy Test
    console.log("5️⃣ Cache Strategy Test:");
    try {
      const response = await client.translate(
        "테스트 문장입니다",
        "ko",
        ["en"],
        {
          useCache: true,
          cacheStrategy: "semantic",
        }
      );
      console.log("✅ Semantic cache translation successful:");
      console.log("   Translation:", response.translations);
      console.log("   Cache Hit:", response.cache_hits);
    } catch (error) {
      console.log("❌ Semantic cache translation failed:", error.message);
    }
    console.log("");

    // 6. Batch Translation Test
    console.log("6️⃣ Batch Translation Test:");
    try {
      const batchRequests = [
        {
          text: "첫 번째 문장",
          source_lang: "ko",
          target_langs: ["en"],
          use_cache: true,
          cache_strategy: "hybrid",
        },
        {
          text: "두 번째 문장",
          source_lang: "ko",
          target_langs: ["en"],
          use_cache: true,
          cache_strategy: "hybrid",
        },
        {
          text: "세 번째 문장",
          source_lang: "ko",
          target_langs: ["en"],
          use_cache: true,
          cache_strategy: "hybrid",
        },
      ];

      const response = await client.batchTranslate(batchRequests);
      console.log("✅ Batch translation successful:");
      console.log("   Total Responses:", response.responses.length);
      console.log("   Success Count:", response.success_count);
      console.log("   Error Count:", response.error_count);
      console.log(
        "   Total Processing Time:",
        response.total_processing_time_ms,
        "ms"
      );

      response.responses.forEach((resp, index) => {
        console.log(`   Response ${index + 1}:`, resp.translations);
      });
    } catch (error) {
      console.log("❌ Batch translation failed:", error.message);
    }
    console.log("");

    // 7. Cache Statistics Test
    console.log("7️⃣ Cache Statistics Test:");
    try {
      const response = await client.getCacheStats();
      console.log("✅ Cache stats retrieved:");
      console.log("   Total Requests:", response.total_requests);
      console.log("   Total Hits:", response.total_hits);
      console.log("   Total Misses:", response.total_misses);
      console.log("   Hit Rate:", response.hit_rate);
      console.log("   Exact Size:", response.exact_size);
      console.log("   Normalized Size:", response.normalized_size);
      console.log("   Semantic Size:", response.semantic_size);
    } catch (error) {
      console.log("❌ Cache stats failed:", error.message);
    }
    console.log("");
  } catch (error) {
    console.error("🚨 Test suite failed:", error);
  } finally {
    client.close();
    console.log("🏁 Test suite completed. Client connection closed.");
  }
}

/**
 * Interactive mode for manual testing
 */
async function interactiveMode() {
  const client = new TranslationGRPCClient();
  const readline = require("readline");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("🎮 Interactive gRPC Translation Client");
  console.log('Type "exit" to quit, "help" for commands\n');

  const askQuestion = (question) => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };

  while (true) {
    try {
      const input = await askQuestion("Enter text to translate (or command): ");

      if (input.toLowerCase() === "exit") {
        break;
      }

      if (input.toLowerCase() === "help") {
        console.log("\nAvailable commands:");
        console.log("- Type any text to translate from Korean to English");
        console.log('- "stats" - Show cache statistics');
        console.log('- "health" - Check server health');
        console.log('- "clear" - Clear cache');
        console.log('- "exit" - Quit the program\n');
        continue;
      }

      if (input.toLowerCase() === "stats") {
        const stats = await client.getCacheStats();
        console.log("📊 Cache Statistics:");
        console.log(`   Hit Rate: ${stats.hit_rate}%`);
        console.log(`   Total Requests: ${stats.total_requests}`);
        console.log(
          `   Cache Sizes - Exact: ${stats.exact_size}, Normalized: ${stats.normalized_size}, Semantic: ${stats.semantic_size}\n`
        );
        continue;
      }

      if (input.toLowerCase() === "health") {
        const health = await client.healthCheck();
        console.log(
          "💓 Health Check:",
          health.healthy ? "✅ Healthy" : "❌ Unhealthy"
        );
        console.log(`   Status: ${health.status}\n`);
        continue;
      }

      if (input.toLowerCase() === "clear") {
        await client.clearCache("all");
        console.log("🗑️ Cache cleared\n");
        continue;
      }

      // Translate the input text
      const response = await client.translate(input, "ko", ["en"]);
      console.log(
        `🔄 Translation: "${response.original_text}" → "${response.translations.en}"`
      );
      console.log(
        `⚡ Time: ${response.processing_time_ms}ms, Cache Hit: ${
          response.cache_hits.en ? "✅" : "❌"
        }\n`
      );
    } catch (error) {
      console.log("❌ Error:", error.message, "\n");
    }
  }

  rl.close();
  client.close();
  console.log("👋 Goodbye!");
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--interactive") || args.includes("-i")) {
    interactiveMode().catch(console.error);
  } else {
    runTests().catch(console.error);
  }
}

module.exports = { TranslationGRPCClient };
