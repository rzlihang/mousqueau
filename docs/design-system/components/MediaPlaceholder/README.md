# MediaPlaceholder

The empty state of the media panel: a `placeholder-height` box with a dashed `line` border and antd's `Empty`, shown until a local file is imported.

- Keep the description to the action: 导入本机视频或音频.
- Under it, the `.path` line shows the media path, or the privacy note 文件保留在本机。仅确认分析时上传选定音频。 when there is none.
- Once media loads, replace it with `<video class="media-video" controls>` (`video-ground` letterbox, `radius-md`, max `video-max-height`).
