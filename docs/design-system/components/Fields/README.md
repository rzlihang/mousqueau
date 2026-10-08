# Fields

Ant Design's form controls under the Mousqueau theme: `Input`, `Input.TextArea`, `InputNumber`, `Select`, `Checkbox`, `Switch`, on `control-bg` with a `control-border`.

- Labels sit above the control inside a `label` element (`.range`, `.time-fields`), in `ink` for range fields and `muted` 12px for time fields.
- Units go in the label: 开始（秒）. Formats go in the placeholder: `https://www.youtube.com/watch?v=…`, 说话人 ID（A / B / C）.
- Inputs that only take URLs or times are still free text; validate on submit and explain the format in the error.
- Give inputs without a visible label an `aria-label` (the speaker form does).
