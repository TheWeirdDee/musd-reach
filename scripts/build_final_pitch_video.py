import os
import subprocess
import glob
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# Find the latest webm recording
recordings = glob.glob(r"apps\web\live_recordings_*\*.webm")
if not recordings:
    raise FileNotFoundError("No live webm recordings found in apps/web!")
raw_video = sorted(recordings, key=os.path.getmtime)[-1]
print(f"Using raw live-site recording: {raw_video}")

# Segments definition based on raw recording timeline
# Total duration of scenes will sum exactly to master_voiceover duration: 116.84s (1:56.84)
SEGMENTS = [
    {"start": 0.0, "end": 14.0, "target_dur": 12.10, "id": "seg_01"},
    {"start": 16.0, "end": 44.0, "target_dur": 24.08, "id": "seg_02"},
    {"start": 46.0, "end": 74.0, "target_dur": 19.90, "id": "seg_03"},
    {"start": 75.0, "end": 104.0, "target_dur": 20.71, "id": "seg_04"},
    {"start": 105.0, "end": 131.0, "target_dur": 18.67, "id": "seg_05"},
    {"start": 132.0, "end": 147.0, "target_dur": 14.54, "id": "seg_06"},
    {"start": 148.0, "end": 158.0, "target_dur": 6.84, "id": "seg_07"},
]

os.makedirs("edit_build", exist_ok=True)
seg_clips = []

for s in SEGMENTS:
    clip_out = f"edit_build/{s['id']}.mp4"
    src_dur = s["end"] - s["start"]
    speed_factor = src_dur / s["target_dur"]
    pts_factor = 1.0 / speed_factor

    print(f"Processing {s['id']}: raw [{s['start']}s - {s['end']}s] -> {s['target_dur']}s...")

    # Fast input seek, adjust playback speed to target scene duration, ensure exact 1920x1080 @ 30fps
    vf = f"setpts={pts_factor:.6f}*PTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30"

    cmd = [
        FFMPEG, "-y",
        "-ss", str(s["start"]),
        "-to", str(s["end"]),
        "-i", raw_video,
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-t", str(s["target_dur"]),
        clip_out
    ]
    subprocess.run(cmd, check=True)
    seg_clips.append(clip_out)

# Concatenate trimmed video segments
concat_file = "edit_build/concat.txt"
with open(concat_file, "w") as f:
    for c in seg_clips:
        f.write(f"file '{os.path.abspath(c).replace(os.sep, '/')}'\n")

merged_video = "edit_build/merged_video.mp4"
print("Merging segments into continuous video...")
concat_cmd = [
    FFMPEG, "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concat_file,
    "-c", "copy",
    merged_video
]
subprocess.run(concat_cmd, check=True)

# Mux with master voiceover and burned-in styled subtitles
srt_path = os.path.abspath("MUSD-Reach-Subtitles.srt").replace("\\", "/").replace(":", "\\:")
final_out = "MUSD-Reach-Pitch-2min.mp4"

print(f"Muxing with audio and subtitles into final {final_out}...")
final_cmd = [
    FFMPEG, "-y",
    "-i", merged_video,
    "-i", "master_voiceover.mp3",
    "-vf", f"subtitles='{srt_path}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=4,MarginV=35'",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    final_out
]
subprocess.run(final_cmd, check=True)

# Verify final duration and streams
res = subprocess.run([FFMPEG, "-i", final_out], stderr=subprocess.PIPE, text=True)
for line in res.stderr.splitlines():
    if "Duration:" in line or "Stream #0:0" in line or "Stream #0:1" in line:
        print("FINAL VERIFIED:", line.strip())

print("Final pitch video built successfully!")
