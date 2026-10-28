# Password Manager launch film

- `brag.mp4`: final 20-second, 1920×1080, 30 fps launch video with music and interface sounds.
- `brag.jpg`: selected product frame, also baked into frame zero of the MP4.
- `watch.html`: local video player. Open after the render completes.
- `share-copy.txt`: caption with music attribution; retain the credit when posting.
- `CREDITS.txt`: music, sound and font credits.
- `brag-plan.md` and `composition-brief.md`: creative direction and source references.
- `composition/`: editable HyperFrames project; local fonts, runtime, screenshots and audio.
- `check-report.json`: validation report.

To edit or render again, open a terminal in `composition/` and run `npm run dev` or `npm run render -- --quality delivery --fps 30 --output ../brag.mp4`. The generated project pins HyperFrames 0.8.191. A new render does not bake the poster automatically.

The vault and extension screenshots come from the project. Generator and login interactions are source-informed demo recreations with fictional data. No real account is used or submitted. No application source was changed for this video.
