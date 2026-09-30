# Đạo Lộ: Vạn Tiên — bản đồ tài liệu

## Đọc theo thứ tự này

| # | Tài liệu | Nói gì |
|---|---|---|
| 1 | **[DESIGN-REPORT.md](DESIGN-REPORT.md)** | **Báo cáo chính. 267k ký tự, 8 section.** Phần 0 là phản biện, đọc nó trước phần 1 |
| 2 | [.research/full-report-critic.md](.research/full-report-critic.md) | Phản biện nguyên văn, không diễn giải |
| 3 | [STORY-SAND-NARRATIVE.md](STORY-SAND-NARRATIVE.md) | Cốt truyện tu tiên qua điêu khắc cát. Có nguồn |
| 4 | [AGENT-PLAYER-DESIGN.md](AGENT-PLAYER-DESIGN.md) | Sáu thay đổi khi agent là người chơi |
| 5 | [ART-DIRECTION-SAND.md](ART-DIRECTION-SAND.md) | Ngôn ngữ hình ảnh. **CHƯA NGHIÊN CỨU** |
| 6 | [.research/critic.md](.research/critic.md) | Phản biện đợt nghiên cứu đầu |

## Nghiên cứu thô, chưa sửa

| File | Nội dung |
|---|---|
| .research/brief-raw.md | 122k ký tự, 6 chiều, exa-backed |
| .research/gap-answers.md | 119k — 4 lỗ hổng, **cả 4 đều bị bác** |
| .research/gap-skeptics.md | 35k — lý do bác, đáng giữ hơn câu trả lời |
| .research/story-mining.md | 181k — 5 thiên về thân, nhịp nào sống với agent |
| .research/full-report.md | 261k — 8 section nguyên văn |

## Năm điều đã học, xếp theo giá trị

1. **`凡人修仙传` là câu trả lời, `斗破蒼航` không chuyển được.** Động cơ Hàn Lậ **tính
   toán, không cảm xúc**: khan hiếm, bất đối xứng, lý do người ta nói không phải lý
   thật. Cần một sổ cái, không cần một vết thương.
2. **Một field mang tập người xem, không mang giá trị + cờ ẩn.** Người đọc muộn là
   khách chính, nên field **hiện với người và ẩn với mọi agent** — không phải ngoại
   lệ, đó là trường hợp tốt nhất.
3. **Repo này đã có tiền lệ, và tôi cứ dựng lại yếu hơn.** `public-event-stream.md`
   (ba tầng), `public-replay.md` (13KB), `activity/src/replay.ts` (projector đã
   ship), `battle/src/feature.ts:124` (tính chất hiển thị cần action để nhìn thấy).
4. **Lọc bác bỏ đúng loại lỗi ít nguy hiểm nhất.** 111 claim bị lo, mọi cái là vượt
   số; claim tải trọng thì không có số nào, nên không bác được. Rồi 8 agent sinh số
   cho lỗ hổng, và skeptic giết con số đầu vì nó là **hằng đẳng thức**.
5. **Tỉ lệ bước no-op của agent chưa được công bố ở đâu cả.** RedundancyBench gán
   nhãn 8.000+ bước bởi sáu chuyên gia và **không nêu tỉ lệ nền**. Nó là *chưa biết*,
   không phải ước lượng. Thí nghiệm: 30 lời gọi LLM, hash chênh lệch trạng thái, 5 phút.

## Bốn quyết định chặn việc viết code

1. **Độ dài lượt** — 12s, 25s, 120s, 600s đang cùng tồn tại
2. **Default của visibility** — deny hay allow
3. **Retry** — giữ transcript hay cắt
4. **隐忍** — giữ lượt trống hay bỏ
