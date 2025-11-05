import asyncio
import grpc
import translation_pb2
import translation_pb2_grpc

async def main():
    async with grpc.aio.insecure_channel("192.168.190.158:50051") as channel:
        stub = translation_pb2_grpc.TranslationServiceStub(channel)
        request = translation_pb2.TranslateRequest(
            text="Hello", source_lang="en", target_langs=["ko"]
        )
        res = await stub.Translate(request)
        print("✅ OK", res)

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(main())
