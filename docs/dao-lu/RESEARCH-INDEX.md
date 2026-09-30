# Đạo Lộ: Vạn Tiên — bản đồ tài liệu

## Đọc theo thứ tự này

| # | Tài liệu | Nói gì |
|---|---|---|
| 0 | **[OPEN-QUESTIONS.md](OPEN-QUESTIONS.md)** | **Còn gì chưa biết, đo bằng cách nào, và phải chọn gì trước khi code.** Bắt đầu ở đây |
| 0.25 | **[TERMINOLOGY-沙雕.md](TERMINOLOGY-沙雕.md)** | **Chốt thuật ngữ.** 沙雕 là slang "ngớ ngẩn", **KHÔNG phải cát** |
| 0.5 | **[REFUTATIONS.md](REFUTATIONS.md)** | **Những chỗ nghiên cứu ĐẠO LỘ đã tự đánh lưa mình.** Đọc trước hai tài liệu dưới |
| 1 | **[GENRE-CANON.md](GENRE-CANON.md)** | **Vực của thể loại.** 12 cụm từ vựng được miễn phí · 41 hệ thống và trạng thái mỗi cái · 15 ràng buộc cứng · 20 cái đừng copy · 9 khoảng trống |
| 2 | **[RPG-SUBSTRATE.md](RPG-SUBSTRATE.md)** | **Chất nền RPG.** Cây vật phẩm · 16 cách làm tiến trình thành hữu hình · 20 chỉ số và cái nào là scalar trong áo · 25 thứ mọi game đều làm giống nhau |
| 3 | **[ART-DIRECTION-SHADIAO.md](ART-DIRECTION-SHADIAO.md)** | **Hướng nghệ thuật — 沙雕修仙动画.** Cơ chế chuyển hình, câu hỏi nghiên cứu, cây breakdown, ba lớp corpus. **CHƯA NGHIÊN CỨU** |
| 4 | **[RECONCILIATION.md](RECONCILIATION.md)** | Đóng sáu mâu thuẫn của báo cáo đầu. **Vẫn đọc** — đơn vị lượt ở đây chưa thực sự lan sang `DESIGN-REPORT.md` |
| 5 | **[DESIGN-REPORT.md](DESIGN-REPORT.md)** | Báo cáo 267k ký tự, 8 section. **ĐÃ BỊ THAY THẾ MỘT PHẦN** bởi ba đợt nghiên cứu; phần 0 là phản biện, đọc nó trước phần 1 |
| 6 | [.research/full-report-critic.md](.research/full-report-critic.md) | Phản biện nguyên văn đợt 1, không diễn giải |
| 7 | [AGENT-PLAYER-DESIGN.md](AGENT-PLAYER-DESIGN.md) | Sáu thay đổi khi agent là người chơi |
| 8 | [DAU-LU-NHAN-VAT-COT-TRUYEN.md](DAU-LU-NHAN-VAT-COT-TRUYEN.md) | Nhân vật và cốt truyện chương 1, viết cho **người** |

### Đã xoá

`ART-DIRECTION-SAND.md` và `STORY-SAND-NARRATIVE.md` — nghiên cứu về **沙画** (hội họa trên cát).
Đã xoá vì đặt nhầm tầng. **Ba thứ trong đó được giữ lại** trong `TERMINOLOGY-沙雕.md` §Nguồn: tiền lệ
thương mại (game tu tiên 《以仙:name》 dùng 角色群像沙画), nguyên văn về cơ chế dựng→xoá, và
con số thật của người làm.

---

## Nghiên cứu thô, chưa sửa

| File | Nội dung |
|---|---|
| .research/brief-raw.md | 122k ký tự, 6 chiều, exa-backed |
| .research/gap-answers.md | 119k — 4 lỗ hổng, **cả 4 đều bị bác** |
| .research/gap-skeptics.md | 35k — lý do bác, đáng giữ hơn câu trả lời |
| .research/story-mining.md | 181k — 5 thiên về thân, nhịp nào sống với agent |
| .research/full-report.md | 261k — 8 section nguyên văn |

---

## Ba đợt nghiên cứu 2026-09-30

109 agent, 16,7M subagent token, mỗi domain một researcher rồi một skeptic độc lập.
Raw: **`.research/2026-09-30/`** — có bốn tệp, và **bạn phải đọc nó trước khi tin bất kỳ report nào**.

**Đợt 1** — 19 domain, thiên về **tiểu thuyết**: vực, thiên phú, tiền, thu thập, đan phương,
pháp bảo, tử thôn, tông môn, 功法, danh hiệu, thú, 秘境, bản đồ, cái chết, đồng hồ, chợ, xã hội,
ba thân, và một domain tìm cái **không game nào giải được**.

**Đợt 2** — 18 domain, thiên về **game đã ship**: nhân vật, cấp độ, tu vi, trang bị, vật phẩm,
符箓, 阵法, 炼器, phân loại 功法, chiến đấu, quái, nhiệm vụ, phe phái, tạo nhân vật, vũ trụ,
đường cong tiến trình, thất bại.

**Đợt 3** — 16 domain + **audit 13 negative**, nhắm vào ba lỗ mà critic của hai đợt trước chỉ:
công thức sát thương/`乘区`, cấu trúc lượt, và kiểm toán mọi claim "đúng một". Thêm: NPC/AI,
đa phiên, khả năng quan sát, lớp học, khám phá xã hội, sức chứa hành trang, chuỗi chế tạo thứ hai,
hoạt ảnh.

### Kết quả đợt 3, một dòng

> Nếu một cảnh giới lớn mua **quyền** chứ không phải số lớn hơn, **trận đấu được phán xử
> bằng ba thiết bị** — một hằng độ khó **người chơi thấy trước khi nhận**, một **loại sát thương
> có tên bỏ qua cơ chế giảm của cảnh giới**, và một **phán quyết đọc từ bộ đếm hoặc đồng hồ** —
> **không bao giờ từ một phép so sánh**. Cả ba đều đã ship, đều có văn bản chính thức.

**Và tiền lệ sát nhất thể loại đã chứng minh không tồn tại ở bất kỳ game nào**: một trận
boss solo **không scalar** — vì **bảng rơi đồ thì không thể**, vì độ hiếm là một *thứ tự*.
Đó là lỗ hổng còn mở, và nó là lỗ hổng thật.

---

## Bảy điều đã học, xếp theo giá trị

1. **Thang không phải thứ cần sửa — chỗ nó được cài vào mới là.** Ba nguồn độc lập, hai hướng
   ngược nhau, cùng một kết luận: `筑基` theo nguyên văn **là hành động mở một mạch**; game
   duy nhất thử "cảnh giới mua quyền chứ không phải số" **không có nhân sát thương nào**; và
   境界 đã bị **cắm vào bậc trật tự lượt** chứ không phải nhân sát thương — rồi ngành **gỡ ra**
2. **Câu trả lời cho bài khó nhất đã có sẵn và đã ship.** `极光世界`, trang chính thức:
   「丹士并不追求法力上的强大，因此永远不会有天劫之忧」 — tử thôn là **thuộc tính của một con
   đường**, không phải ngưỡng phải vượt. Bản tổng hợp đã khẳng định thể loại "sai chỗ này
   nhất quán nhất" mà chưa từng gặp nó
3. **Một scalar là câu trả lời của nhà thiết kế, không phải của agent.** Luật repo nói: một
   khi con số tồn tại, mọi hệ khác trở thành hàm của nó — đó là nói về **nhà thiết kế dựng
   gì**. Agent có gộp được vector hay không là câu khác, và `LISTEN` (arXiv 2510.25799) nói
   agent làm được. **Tài liệu đã bảo vệ một lập luận khác bằng lý do của nó**
4. **`凡人修仙传` là câu trả lời, `斗破苍穹` không chuyển được.** Động cơ Hàn Lậ **tính toán, không
   cảm xúc**: khan hiếm, bất đối xứng, lý do người ta nói không phải lý thật. Cần một sổ cái,
   không cần một vết thương
5. **Một field mang tập người xem, không mang giá trị + cờ ẩn.** Người đọc muộn là khách
   chính, nên field **hiện với người và ẩn với mọi agent** — không phải ngoại lệ, đó là trường
   hợp tốt nhất
6. **Lọc bác bỏ đúng loại lỗi ít nguy hiểm nhất.** 111 claim bị lo, mọi cái là vượt số; claim
   tải trọng thì không có số nào, nên không bác được. Rồi 8 agent sinh số cho lỗ hổng, và
   skeptic giết con số đầu vì nó là **hằng đẳng thức**
7. **Tỉ lệ bước no-op của agent chưa được công bố ở đâu cả.** RedundancyBench gán nhãn 8.000+
   bước bởi sáu chuyên gia và **không nêu tỉ lệ nền**. Nó là *chưa biết*, không phải ước
   lượng. Thí nghiệm: 30 lời gọi LLM, hash chênh lệch trạng thái, 5 phút

---

## Bốn quyết định chặn việc viết code — đã đóng

| | Trước | Sau |
|---|---|---|
| Độ dài lượt | 12s, 25s, 120s, 600s | **Đơn vị duy nhất là lượt. Giây chỉ tồn tại khi render** |
| Default visibility | hai mục đối nghịch | **default-deny**, từ lập luận "quên chú thích phải fail an toàn" |
| Retry | giữ hay cắt, không thể cùng đúng | **giữ + cờ `retried`** — replay vẫn là hàm thuần của log bền |
| 隐忍 | bắt buộc là lượt trống | **bỏ.** Lượt trống là *lựa chọn* của agent, không phải kịch bản |

Còn lại: sáu câu **cần bạn chốt** — xem `OPEN-QUESTIONS.md` §5.
