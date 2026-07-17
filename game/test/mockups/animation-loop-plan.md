# Action-space loop plan

The `*-v2.png` files are the approved composition/style frames. Keep the camera
locked and preserve their centered one-point construction throughout animation.

## Shared production rules

- Playback: 24 fps on twos (12 unique drawings per second).
- Do not animate the camera, walls, floor, furniture, or perspective.
- Render a static background plate plus transparent cel overlays for localized motion.
- Keep dynamic player/editor characters on their own house-color-aware layer.
- Use the v2 still as the reduced-motion frame and as both the first and last loop pose.
- Apply film grain/line boil as one shared lightweight overlay, not separately per object.

| Action | Loop | Localized motion layers |
| --- | ---: | --- |
| Hire | 6 s | ceiling fan; typewriter carriage/fingers; one phone ring; middle hopeful's arm/mouth; woman's tapping foot |
| Develop | 8 s | typing hands/carriage; one pinned page flutter; pencil and drawing marks; lamp gutter; cat tail; window beacon |
| Ideas | 6 s | espresso steam; two cup wisps; idea-bulb pop/glow; barista hand; neon flicker; pendant glow |
| Print | 8 s | press drums/gears; paper registration marks; lever arm; output sheet; steam puff; single spark/ink drip; lamp gutter |
| Royalties | 6 s | falling coin; accountant hand; register drawer/flag; ticker tape; clock/safe dial; sconce gutter |
| Sales | 8 s | seamless cloud wrap; awning hem; vendor mouth/arm; taxi pass; two pedestrians; pigeon peck; lamp glow |

## Runtime proposal

Use small sprite strips or an atlas for each moving element and a scene timeline that
indexes those strips. This is preferable to flattened animated WebP/video because the
game can retain deterministic timing, pause/reduced-motion behavior, and publisher-
specific editor colors without decoding six continuously playing videos.
