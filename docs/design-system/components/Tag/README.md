# Tag

Ant Design's `Tag` in `control-sm`, `radius-sm`, used for status words. Each preset maps to one meaning.

| Preset | Tokens | Meaning | Examples |
| --- | --- | --- | --- |
| `green` | `tag-green-*` | Ready | FFmpeg 已就绪, OpenAI 已配置 |
| `orange` | `tag-orange-*` | Needs attention or human review | FFmpeg 未安装, 待复核, 需人工复核 |
| `gold` | `tag-gold-*` | Unapplied local change | 尚未套用 |
| `blue` | `tag-blue-*` | Pending decision | 待确认, 已接受, 已拒绝 |
| default | `tag-default-bg`, `control-border` | Off, optional, unknown | OpenAI 未配置 · 可离线编辑, Unknown |

- The word carries the meaning; the color only groups it.
- In light, `Provider` darkens the green, orange and gold text to antd's step 8 (gold slightly darker) so tags reach 4.5:1. The app still uses antd's step 7.
- Speaker tags are a separate, solid style: see SpeakerTag.
