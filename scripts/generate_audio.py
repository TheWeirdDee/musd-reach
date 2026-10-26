import asyncio
import os
import edge_tts
import time

VOICE = "en-US-ChristopherNeural"
RATE = "+13%" # Natural professional pitch pace (~117s total)

SCENES = [
    {
        "id": "scene_01",
        "text": "What if your savings could stay on Mezo, while you used a claim on them on another blockchain? Today, moving savings value elsewhere means withdrawing first, forfeiting your position, and bridging raw stablecoins."
    },
    {
        "id": "scene_02",
        "text": "MUSD Reach changes that. Your savings position stays right on Mezo. We wrap and lock the corresponding savings shares, then issue a backed, transferable receipt on Base Sepolia."
    },
    {
        "id": "scene_03",
        "text": "Here is the live application. I connect my wallet on Mezo testnet, enter six MUSD, and initiate the lock. In a single atomic transaction, the MUSD enters the native savings vault, shares are wrapped, and locked in the source gateway. Here is the confirmed transaction on Mezo testnet at block 16279430."
    },
    {
        "id": "scene_04",
        "text": "Wormhole carries the authenticated message to Base Sepolia. Once Wormhole guardians sign the proof, the destination gateway verifies every parameter, consumes the transfer ID, and mints exactly six rwSMUSD receipts. The underlying savings shares remain locked and safe on Mezo."
    },
    {
        "id": "scene_05",
        "text": "That receipt is a standard ERC-20. It can be held, traded, or transferred to another wallet—which we verified on BaseScan with a three rwSMUSD transfer. And when the holder wants their value back, they burn the receipt on Base. The authenticated return message releases the corresponding shares or unwrapped MUSD directly on Mezo."
    },
    {
        "id": "scene_06",
        "text": "This is not just bridging tokens. It is making savings positions portable while keeping liquidity on Mezo. And you do not have to take our word for it: our public proof engine reconciles every locked share against issued receipts in real time, with sixty-two independent verification checks passing."
    },
    {
        "id": "scene_07",
        "text": "MUSD Reach allows Mezo to keep its core savings liquidity, while empowering savers to explore the broader crypto economy. Fully functional, verified on public testnets, with transparent backing. Your savings stay on Mezo. Their reach doesn't have to."
    }
]

async def generate():
    os.makedirs("audio_build", exist_ok=True)
    for sc in SCENES:
        out_mp3 = f"audio_build/{sc['id']}.mp3"
        for attempt in range(5):
            try:
                print(f"Generating {sc['id']} with rate {RATE}...")
                comm = edge_tts.Communicate(sc['text'], VOICE, rate=RATE)
                await comm.save(out_mp3)
                if os.path.exists(out_mp3) and os.path.getsize(out_mp3) > 1000:
                    print(f"Success {out_mp3} ({os.path.getsize(out_mp3)} bytes)")
                    break
            except Exception as e:
                print(f"Attempt {attempt+1} error: {e}")
                await asyncio.sleep(1.5)
        await asyncio.sleep(0.5)

if __name__ == "__main__":
    asyncio.run(generate())
